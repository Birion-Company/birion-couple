"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { canEditTx, canManageCard, NOT_YOURS } from "@/lib/access";
import { involved, logActivity, snapshots, type ActivityItem } from "@/lib/activity";
import { requireAuth } from "@/lib/auth";
import { applyCsvMapping, guessMapping, readCsvTable } from "@/lib/import/csv";
import { externalIds, matchCategory } from "@/lib/import/dedupe";
import { parseOfx } from "@/lib/import/ofx";
import { merchantKey, parseInstallment } from "@/lib/import/patterns";
import { daysBetween } from "@/lib/cards";
import { expandInstallments, learnedByMerchant, PREDICTED } from "@/lib/patterns-server";
import type { CsvMapping, ParseIssue } from "@/lib/import/types";
import { splitEqually } from "@/lib/money";
import { checkPeople, usablePeople } from "@/lib/people-access";

const MAX_TEXT = 3_000_000; // ~3 MB de texto

export type PreviewRow = {
  key: string;
  date: string;
  description: string;
  amountCents: number;
  duplicate: boolean;
  categoryId: string | null;
  /** Pagamento da fatura (numa fatura de cartão): começa desmarcado, porque não é gasto. */
  billPayment: boolean;
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
  /** OFX: extrato de conta ou fatura de cartão. */
  statement?: "bank" | "card";
};

const BILL_PAYMENT = /pagamento (recebido|de fatura|da fatura|efetuado)|pgto\.? ?(de )?fatura|pagamento fatura/i;

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
  // Sem regra: a categoria da última compra no mesmo estabelecimento.
  const learned = await learnedByMerchant(auth.householdId);
  const rows: PreviewRow[] = parsed.rows.map((r, i) => ({
    key: ids[i],
    date: r.date,
    description: r.description,
    amountCents: r.amountCents,
    duplicate: existing.has(ids[i]),
    categoryId: r.amountCents < 0 ? matchCategory(r.description, rules) ?? learned.get(merchantKey(r.description))?.categoryId ?? null : null,
    billPayment: r.amountCents > 0 && BILL_PAYMENT.test(r.description),
  }));
  const statement = "statement" in parsed ? parsed.statement : undefined;
  return { ok: true, format, headers, sample, mapping, rows, issues: parsed.issues.slice(0, 20), statement };
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
        /** "Não precisa de categoria" nesta linha. */
        noCategory: z.boolean().optional(),
      }),
    )
    .min(1, { error: "Escolha pelo menos uma linha." })
    .max(5000),
  payerId: z.uuid().nullable(),
  splitIds: z.array(z.uuid()).min(1, { error: "Escolha quem divide as despesas." }),
  /** Ignorado: o status agora é calculado (mantido para quem estiver com a tela antiga aberta). */
  statusId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable(),
  cardId: z.uuid().nullable().optional(),
});

export async function commitImport(input: z.input<typeof CommitSchema>): Promise<{ ok: boolean; error?: string; imported?: number; skipped?: number; replaced?: number; learnedSplits?: number; predicted?: number }> {
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
  if (await checkPeople(auth.householdId, auth.userId, people)) return { ok: false, error: "Pessoa inválida." };
  const catIds = [...new Set(data.rows.map((r) => r.categoryId).filter((c): c is string => !!c))];
  if (catIds.length) {
    const found = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(and(eq(schema.categories.householdId, auth.householdId), inArray(schema.categories.id, catIds)));
    if (found.length !== catIds.length) return { ok: false, error: "Categoria inválida." };
  }
  if (data.cardId) {
    const [card] = await db
      .select({ ownerId: schema.creditCards.ownerId })
      .from(schema.creditCards)
      .where(and(eq(schema.creditCards.id, data.cardId), eq(schema.creditCards.householdId, auth.householdId)));
    if (!card) return { ok: false, error: "Cartão inválido." };
    if (!canManageCard(auth, card)) return { ok: false, error: "Você só pode importar para os seus cartões." };
    // No cartão, quem pagou é sempre o dono dele.
    if (card.ownerId) data.payerId = card.ownerId;
  }
  for (const [table, id] of [[schema.projects, data.projectId], [schema.creditCards, data.cardId ?? null]] as const) {
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
    let replaced = 0;
    let learnedSplits = 0;
    const items: ActivityItem[] = [];
    // O que já se sabe de cada estabelecimento (de quem é a conta), para classificar sozinho.
    const learned = await learnedByMerchant(auth.householdId, tx);
    // Só pessoas que quem importa pode usar (contato de outra pessoa não entra pela divisão aprendida).
    const usable = await usablePeople(auth.householdId, auth.userId, tx);
    const alive = new Set(
      (await tx.select({ id: schema.participants.id }).from(schema.participants).where(and(eq(schema.participants.householdId, auth.householdId), eq(schema.participants.archived, false))))
        .map((x) => x.id)
        .filter((id) => usable.has(id)),
    );
    // Só reaproveita a divisão quando o histórico do lugar é sempre igual. Se varia (uber às vezes é de outra
    // pessoa), usa a divisão padrão da importação e marca para conferir em A identificar: nada se perde.
    const splitFor = (description: string, amountCents: number) => {
      const l = amountCents < 0 ? learned.get(merchantKey(description)) : undefined;
      const known = l?.consistent ? l.participantIds.filter((id) => alive.has(id)) : undefined;
      return known?.length ? known : null;
    };
    const mustCheck = (description: string, amountCents: number) => {
      const l = amountCents < 0 ? learned.get(merchantKey(description)) : undefined;
      return !!l && l.seen >= 2 && !l.consistent;
    };
    // Parcela que o app já tinha previsto ("Parcela 4/10" criada pela importação anterior): vira a de verdade.
    const rest: typeof data.rows = [];
    for (const r of data.rows) {
      const inst = r.amountCents < 0 ? parseInstallment(r.description) : null;
      const candidates = inst
        ? await tx
            .select({ id: schema.transactions.id, date: schema.transactions.date })
            .from(schema.transactions)
            .where(
              and(
                eq(schema.transactions.householdId, auth.householdId),
                eq(schema.transactions.source, PREDICTED),
                eq(schema.transactions.seriesIndex, inst.index),
                eq(schema.transactions.seriesTotal, inst.total),
                sql`lower(${schema.transactions.description}) = lower(${inst.base})`,
              ),
            )
        : [];
      const predicted = candidates.find((x) => Math.abs(daysBetween(x.date, r.date)) <= 25);
      if (predicted) {
        await tx
          .update(schema.transactions)
          .set({ date: r.date, amountCents: Math.abs(r.amountCents), source: data.format, externalId: r.key, importBatchId: batch.id, updatedAt: new Date() })
          .where(eq(schema.transactions.id, predicted.id));
        // Valor de verdade pode ter mudado alguns centavos: a divisão acompanha.
        const old = await tx.select().from(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, predicted.id));
        const parts = splitEqually(Math.abs(r.amountCents), old.length || 1);
        for (const [k, x] of old.entries()) {
          await tx
            .update(schema.transactionSplits)
            .set({ amountCents: parts[k] })
            .where(and(eq(schema.transactionSplits.transactionId, x.transactionId), eq(schema.transactionSplits.participantId, x.participantId)));
        }
        replaced++;
        continue;
      }
      rest.push(r);
    }
    for (let i = 0; i < rest.length; i += 200) {
      const chunk = rest.slice(i, i + 200);
      const inserted = await tx
        .insert(schema.transactions)
        .values(
          chunk.map((r) => ({
            householdId: auth.householdId,
            date: r.date,
            // "Loja - Parcela 2/3" vira "Loja", com a parcela guardada na série (aparece ao lado: Parcela 2/3).
            ...installmentFields(r.description, r.amountCents),
            description: (r.amountCents < 0 ? parseInstallment(r.description)?.base : null) || r.description || "Sem descrição",
            amountCents: Math.abs(r.amountCents),
            kind: r.amountCents < 0 ? "expense" : "income",
            payerId: data.payerId,
            // Receita não tem categoria.
            categoryId: r.amountCents < 0 ? r.categoryId : null,
            noCategory: r.amountCents < 0 && !r.categoryId && !!r.noCategory,
            projectId: data.projectId,
            // Entrada (receita) não fica em cartão.
            cardId: r.amountCents < 0 ? data.cardId ?? null : null,
            source: data.format,
            externalId: r.key,
            importBatchId: batch.id,
            reuseCheck: mustCheck(r.description, r.amountCents),
            createdBy: auth.userId,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: schema.transactions.id, amountCents: schema.transactions.amountCents, description: schema.transactions.description });
      for (const row of inserted) items.push({ d: row.description, a: involved({ payerId: data.payerId, splits: data.splitIds.map((p) => ({ participantId: p, amountCents: 0 })) }) });
      const byId = new Map(chunk.map((r) => [(r.amountCents < 0 ? parseInstallment(r.description)?.base : null) || r.description || "Sem descrição", r]));
      const splits = inserted.flatMap((row) => {
        const src = byId.get(row.description);
        const people = (src && splitFor(src.description, src.amountCents)) ?? data.splitIds;
        if (people !== data.splitIds) learnedSplits++;
        const parts = splitEqually(row.amountCents, people.length);
        return people.map((participantId, k) => ({ transactionId: row.id, participantId, amountCents: parts[k] }));
      });
      if (splits.length) await tx.insert(schema.transactionSplits).values(splits);
      imported += inserted.length;
    }
    imported += replaced;
    const skipped = data.rows.length - imported;
    await tx.update(schema.importBatches).set({ imported, skipped }).where(eq(schema.importBatches.id, batch.id));
    if (items.length) {
      await logActivity(tx, auth, { action: "imported", data: { fileName: data.fileName || "arquivo", items }, audience: items.flatMap((x) => x.a) });
    }
    return { imported, skipped, replaced, learnedSplits };
  });
  // Parcelas novas no extrato: já cria as dos próximos meses.
  const predicted = await expandInstallments(auth.householdId);
  revalidatePath("/", "layout");
  return { ok: true, ...result, predicted };
}

/** Parcela do extrato: guarda o número na série; a série em si é criada em expandInstallments. */
function installmentFields(description: string, amountCents: number) {
  const inst = amountCents < 0 ? parseInstallment(description) : null;
  return inst ? { seriesKind: "installment", seriesIndex: inst.index, seriesTotal: inst.total } : {};
}

export async function savePreset(name: string, mapping: CsvMapping) {
  const auth = await requireAuth();
  const parsed = z.object({ name: z.string().trim().min(1).max(60), mapping: MappingSchema }).safeParse({ name, mapping });
  if (!parsed.success) return { ok: false, error: "Dê um nome ao modelo." };
  await getDb().insert(schema.csvPresets).values({ householdId: auth.householdId, ...parsed.data });
  revalidatePath("/ajustes/importacao");
  return { ok: true, message: "Modelo salvo. Ele aparece na próxima importação de CSV." };
}

/** Apaga uma importação inteira: todos os lançamentos que vieram do arquivo e o registro dela. */
export async function deleteImport(batchId: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  const auth = await requireAuth();
  const id = z.uuid().safeParse(batchId);
  if (!id.success) return { ok: false, error: "Importação inválida." };
  const db = getDb();
  const removed = await db.transaction(async (tx) => {
    const [batch] = await tx
      .select({ id: schema.importBatches.id, createdBy: schema.importBatches.createdBy, fileName: schema.importBatches.fileName })
      .from(schema.importBatches)
      .where(and(eq(schema.importBatches.id, id.data), eq(schema.importBatches.householdId, auth.householdId)));
    if (!batch) return null;
    if (!canEditTx(auth, batch.createdBy)) return "forbidden" as const;
    const ids = (
      await tx
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(and(eq(schema.transactions.householdId, auth.householdId), eq(schema.transactions.importBatchId, batch.id)))
    ).map((r) => r.id);
    const snaps = await snapshots(tx, auth.householdId, ids);
    const rows = await tx
      .delete(schema.transactions)
      .where(and(eq(schema.transactions.householdId, auth.householdId), eq(schema.transactions.importBatchId, batch.id)))
      .returning({ id: schema.transactions.id });
    await tx.delete(schema.importBatches).where(eq(schema.importBatches.id, batch.id));
    const items = [...snaps.values()].map((x) => ({ d: x.description, a: involved(x) }));
    if (items.length) await logActivity(tx, auth, { action: "import_deleted", data: { fileName: batch.fileName, items }, audience: items.flatMap((x) => x.a) });
    return rows.length;
  });
  if (removed === null) return { ok: false, error: "Importação não encontrada." };
  if (removed === "forbidden") return { ok: false, error: NOT_YOURS };
  revalidatePath("/", "layout");
  return { ok: true, message: removed === 1 ? "Importação apagada: 1 lançamento removido." : `Importação apagada: ${removed} lançamentos removidos.` };
}
