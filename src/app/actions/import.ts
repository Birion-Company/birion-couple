"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { applyCsvMapping, guessMapping, readCsvTable } from "@/lib/import/csv";
import { externalIds, matchCategory } from "@/lib/import/dedupe";
import { parseOfx } from "@/lib/import/ofx";
import type { CsvMapping, ParseIssue } from "@/lib/import/types";
import { splitEqually } from "@/lib/money";

const MAX_TEXT = 3_000_000; // ~3 MB de texto

export type PreviewRow = {
  key: string;
  date: string;
  description: string;
  amountCents: number;
  duplicate: boolean;
  categoryId: string | null;
};

export type PreviewResult = {
  ok: boolean;
  error?: string;
  format?: "ofx" | "csv";
  headers?: string[];
  sample?: string[][];
  mapping?: CsvMapping;
  rows?: PreviewRow[];
  issues?: ParseIssue[];
};

const MappingSchema = z.object({
  dateColumn: z.number().int().min(0),
  descriptionColumn: z.number().int().min(0),
  amountColumn: z.number().int().min(-1),
  debitColumn: z.number().int().min(-1),
  creditColumn: z.number().int().min(-1),
  dateFormat: z.enum(["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"]),
  decimal: z.enum([",", "."]),
  positiveIsExpense: z.boolean(),
  hasHeader: z.boolean(),
});

function detectFormat(fileName: string, text: string): "ofx" | "csv" {
  if (/\.(ofx|qfx)$/i.test(fileName) || /<OFX>/i.test(text.slice(0, 5000))) return "ofx";
  return "csv";
}

/** Lê o arquivo e devolve a prévia, marcando o que já foi importado antes. */
export async function previewImport(input: { fileName: string; text: string; mapping?: CsvMapping }): Promise<PreviewResult> {
  const auth = await requireAuth();
  if (!input.text || input.text.length > MAX_TEXT) return { ok: false, error: "Arquivo vazio ou grande demais (máximo 3 MB)." };
  const format = detectFormat(input.fileName, input.text);
  let parsed;
  let mapping: CsvMapping | undefined;
  let headers: string[] | undefined;
  let sample: string[][] | undefined;
  if (format === "ofx") {
    parsed = parseOfx(input.text);
  } else {
    const table = readCsvTable(input.text);
    if (table.rows.length === 0) return { ok: false, error: "Não encontrei linhas neste CSV." };
    const m = input.mapping ? MappingSchema.safeParse(input.mapping) : null;
    mapping = m?.success ? m.data : guessMapping(table);
    headers = table.headers;
    sample = table.rows.slice(0, 6);
    parsed = applyCsvMapping(table, mapping);
  }
  const ids = externalIds(parsed.rows, format);
  const db = getDb();
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const found = await db
      .select({ id: schema.transactions.externalId })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.externalId, ids.slice(i, i + 500))));
    found.forEach((f) => f.id && existing.add(f.id));
  }
  const rules = await db
    .select({ pattern: schema.categoryRules.pattern, categoryId: schema.categoryRules.categoryId })
    .from(schema.categoryRules)
    .where(eq(schema.categoryRules.householdId, auth.householdId));
  const rows: PreviewRow[] = parsed.rows.map((r, i) => ({
    key: ids[i],
    date: r.date,
    description: r.description,
    amountCents: r.amountCents,
    duplicate: existing.has(ids[i]),
    categoryId: matchCategory(r.description, rules),
  }));
  return { ok: true, format, headers, sample, mapping, rows, issues: parsed.issues.slice(0, 20) };
}

const CommitSchema = z.object({
  fileName: z.string().max(200),
  format: z.enum(["ofx", "csv"]),
  rows: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().max(300),
        amountCents: z.number().int(),
        categoryId: z.uuid().nullable(),
      }),
    )
    .min(1, { error: "Escolha pelo menos uma linha." })
    .max(5000),
  payerId: z.uuid().nullable(),
  splitIds: z.array(z.uuid()).min(1, { error: "Escolha quem divide as despesas." }),
  statusId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
});

export async function commitImport(input: z.input<typeof CommitSchema>): Promise<{ ok: boolean; error?: string; imported?: number; skipped?: number }> {
  const auth = await requireAuth();
  const parsed = CommitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  const db = getDb();

  // Tudo precisa ser desta família.
  const people = [...new Set([...data.splitIds, ...(data.payerId ? [data.payerId] : [])])];
  const foundPeople = await db
    .select({ id: schema.participants.id })
    .from(schema.participants)
    .where(and(eq(schema.participants.householdId, auth.householdId), inArray(schema.participants.id, people)));
  if (foundPeople.length !== people.length) return { ok: false, error: "Pessoa inválida." };
  const catIds = [...new Set(data.rows.map((r) => r.categoryId).filter((c): c is string => !!c))];
  if (catIds.length) {
    const found = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(and(eq(schema.categories.householdId, auth.householdId), inArray(schema.categories.id, catIds)));
    if (found.length !== catIds.length) return { ok: false, error: "Categoria inválida." };
  }
  for (const [table, id] of [[schema.statuses, data.statusId], [schema.projects, data.projectId]] as const) {
    if (!id) continue;
    const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.householdId, auth.householdId)));
    if (!row) return { ok: false, error: "Opção inválida." };
  }

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(schema.importBatches)
      .values({ householdId: auth.householdId, fileName: data.fileName || "arquivo", format: data.format, createdBy: auth.userId })
      .returning({ id: schema.importBatches.id });
    let imported = 0;
    for (let i = 0; i < data.rows.length; i += 200) {
      const chunk = data.rows.slice(i, i + 200);
      const inserted = await tx
        .insert(schema.transactions)
        .values(
          chunk.map((r) => ({
            householdId: auth.householdId,
            date: r.date,
            description: r.description || "Sem descrição",
            amountCents: Math.abs(r.amountCents),
            kind: r.amountCents < 0 ? "expense" : "income",
            payerId: data.payerId,
            categoryId: r.categoryId,
            projectId: data.projectId,
            statusId: data.statusId,
            source: data.format,
            externalId: r.key,
            importBatchId: batch.id,
            createdBy: auth.userId,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: schema.transactions.id, amountCents: schema.transactions.amountCents });
      const splits = inserted.flatMap((row) => {
        const parts = splitEqually(row.amountCents, data.splitIds.length);
        return data.splitIds.map((participantId, k) => ({ transactionId: row.id, participantId, amountCents: parts[k] }));
      });
      if (splits.length) await tx.insert(schema.transactionSplits).values(splits);
      imported += inserted.length;
    }
    const skipped = data.rows.length - imported;
    await tx.update(schema.importBatches).set({ imported, skipped }).where(eq(schema.importBatches.id, batch.id));
    return { imported, skipped };
  });
  revalidatePath("/", "layout");
  return { ok: true, ...result };
}

export async function savePreset(name: string, mapping: CsvMapping) {
  const auth = await requireAuth();
  const parsed = z.object({ name: z.string().trim().min(1).max(60), mapping: MappingSchema }).safeParse({ name, mapping });
  if (!parsed.success) return { ok: false, error: "Dê um nome ao modelo." };
  await getDb().insert(schema.csvPresets).values({ householdId: auth.householdId, ...parsed.data });
  revalidatePath("/importar");
  return { ok: true, message: "Modelo salvo. Ele aparece na próxima importação de CSV." };
}
