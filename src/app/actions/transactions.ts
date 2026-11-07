"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { splitEqually } from "@/lib/money";
import type { ActionResult } from "./settings";

const uuid = z.uuid();
const optionalId = z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null);

const TxSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Escolha a data." }),
  description: z.string().trim().min(1, { error: "Escreva uma descrição." }).max(200),
  amountCents: z.number().int().positive({ error: "O valor precisa ser maior que zero." }).max(1_000_000_000),
  kind: z.enum(["expense", "income", "transfer"]),
  payerId: optionalId,
  categoryId: optionalId,
  projectId: optionalId,
  statusId: optionalId,
  notes: z.string().trim().max(1000).optional().nullable(),
  splitMode: z.enum(["equal", "custom"]),
  splits: z.array(z.object({ participantId: uuid, amountCents: z.number().int().min(0) })),
});

export type TxInput = z.input<typeof TxSchema>;

/** Confere que todos os ids pertencem à família, para ninguém gravar em dados de outra. */
async function checkOwnership(householdId: string, data: z.output<typeof TxSchema>) {
  const db = getDb();
  const participantIds = [...new Set([...(data.payerId ? [data.payerId] : []), ...data.splits.map((s) => s.participantId)])];
  if (participantIds.length) {
    const found = await db
      .select({ id: schema.participants.id })
      .from(schema.participants)
      .where(and(eq(schema.participants.householdId, householdId), inArray(schema.participants.id, participantIds)));
    if (found.length !== participantIds.length) return "Pessoa inválida.";
  }
  const checks: [typeof schema.categories | typeof schema.projects | typeof schema.statuses, string | null][] = [
    [schema.categories, data.categoryId],
    [schema.projects, data.projectId],
    [schema.statuses, data.statusId],
  ];
  for (const [table, id] of checks) {
    if (!id) continue;
    const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.householdId, householdId)));
    if (!row) return "Opção inválida.";
  }
  return null;
}

function normalizeSplits(data: z.output<typeof TxSchema>) {
  if (data.splitMode === "equal") {
    const people = data.splits.map((s) => s.participantId);
    const parts = splitEqually(data.amountCents, people.length);
    return people.map((participantId, i) => ({ participantId, amountCents: parts[i] }));
  }
  return data.splits.filter((s) => s.amountCents > 0);
}

export async function saveTransaction(id: string | null, input: TxInput): Promise<ActionResult & { id?: string }> {
  const auth = await requireAuth();
  const parsed = TxSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  if (data.splits.length === 0) return { ok: false, error: "Escolha pelo menos uma pessoa na divisão." };
  if (data.kind === "transfer" && !data.payerId) return { ok: false, error: "Diga quem pagou o acerto." };
  const splits = normalizeSplits(data);
  const sum = splits.reduce((a, s) => a + s.amountCents, 0);
  if (sum !== data.amountCents) return { ok: false, error: "A soma das partes precisa ser igual ao valor total." };
  const problem = await checkOwnership(auth.householdId, data);
  if (problem) return { ok: false, error: problem };

  const db = getDb();
  const values = {
    date: data.date,
    description: data.description,
    amountCents: data.amountCents,
    kind: data.kind,
    payerId: data.payerId,
    categoryId: data.categoryId,
    projectId: data.projectId,
    statusId: data.statusId,
    notes: data.notes || null,
    updatedAt: new Date(),
  };
  const savedId = await db.transaction(async (tx) => {
    let txId = id;
    if (id) {
      const updated = await tx
        .update(schema.transactions)
        .set(values)
        .where(and(eq(schema.transactions.id, id), eq(schema.transactions.householdId, auth.householdId)))
        .returning({ id: schema.transactions.id });
      if (updated.length === 0) throw new Error("not-found");
      await tx.delete(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, id));
    } else {
      const [row] = await tx
        .insert(schema.transactions)
        .values({ ...values, householdId: auth.householdId, createdBy: auth.userId, source: "manual" })
        .returning({ id: schema.transactions.id });
      txId = row.id;
    }
    await tx.insert(schema.transactionSplits).values(splits.map((s) => ({ ...s, transactionId: txId! })));
    return txId!;
  });
  revalidatePath("/", "layout");
  return { ok: true, id: savedId, message: id ? "Lançamento atualizado." : "Lançamento salvo." };
}

export async function deleteTransactions(ids: string[]): Promise<ActionResult> {
  const auth = await requireAuth();
  const list = z.array(uuid).max(1000).safeParse(ids);
  if (!list.success || list.data.length === 0) return { ok: false, error: "Nada selecionado." };
  await getDb()
    .delete(schema.transactions)
    .where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.id, list.data)));
  revalidatePath("/", "layout");
  return { ok: true, message: list.data.length === 1 ? "Lançamento excluído." : `${list.data.length} lançamentos excluídos.` };
}

/** Muda o status de vários lançamentos de uma vez (ex.: marcar tudo como reembolsado). */
export async function setTransactionsStatus(ids: string[], statusId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const list = z.array(uuid).max(1000).safeParse(ids);
  if (!list.success || list.data.length === 0) return { ok: false, error: "Nada selecionado." };
  const db = getDb();
  const [status] = await db
    .select()
    .from(schema.statuses)
    .where(and(eq(schema.statuses.id, statusId), eq(schema.statuses.householdId, auth.householdId)));
  if (!status) return { ok: false, error: "Status inválido." };
  await db
    .update(schema.transactions)
    .set({ statusId, updatedAt: new Date() })
    .where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.id, list.data)));
  revalidatePath("/", "layout");
  return { ok: true, message: `Marcado como "${status.name}".` };
}

/** Atualiza só o que veio preenchido (categoria, projeto ou quem pagou) em vários lançamentos. */
export async function bulkUpdate(ids: string[], patch: { categoryId?: string | null; projectId?: string | null }): Promise<ActionResult> {
  const auth = await requireAuth();
  const list = z.array(uuid).max(1000).safeParse(ids);
  if (!list.success || list.data.length === 0) return { ok: false, error: "Nada selecionado." };
  const db = getDb();
  const set: Record<string, string | null | Date> = { updatedAt: new Date() };
  if (patch.categoryId !== undefined) {
    if (patch.categoryId) {
      const [c] = await db.select().from(schema.categories).where(and(eq(schema.categories.id, patch.categoryId), eq(schema.categories.householdId, auth.householdId)));
      if (!c) return { ok: false, error: "Categoria inválida." };
    }
    set.categoryId = patch.categoryId;
  }
  if (patch.projectId !== undefined) {
    if (patch.projectId) {
      const [p] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, patch.projectId), eq(schema.projects.householdId, auth.householdId)));
      if (!p) return { ok: false, error: "Projeto inválido." };
    }
    set.projectId = patch.projectId;
  }
  await db
    .update(schema.transactions)
    .set(set)
    .where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.id, list.data)));
  revalidatePath("/", "layout");
  return { ok: true, message: "Lançamentos atualizados." };
}
