"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gt, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { canEditTx, canManageCard, checkEditable, NOT_YOURS } from "@/lib/access";
import { diff, involved, logActivity, snapshots, type TxSnapshot } from "@/lib/activity";
import { requireAuth } from "@/lib/auth";
import { buildSeries, monthLabel, todayIn } from "@/lib/cards";
import { materializeRecurring } from "@/lib/recurring-server";
import { splitEqually } from "@/lib/money";
import type { ActionResult } from "./settings";

const uuid = z.uuid();
const optionalId = z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null);

const TxSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Escolha a data." }),
  description: z.string().trim().min(1, { error: "Escreva uma descrição." }).max(200),
  amountCents: z.number().int().positive({ error: "O valor precisa ser maior que zero." }).max(1_000_000_000),
  kind: z.enum(["expense", "income", "transfer", "loan"]),
  payerId: optionalId,
  categoryId: optionalId,
  projectId: optionalId,
  statusId: optionalId,
  cardId: optionalId.optional().transform((v) => v ?? null),
  notes: z.string().trim().max(1000).optional().nullable(),
  /** Só ao criar: parcelar o valor total ou repetir o valor todo mês. */
  series: z
    .object({
      kind: z.enum(["installment", "monthly"]),
      /** Nulo em "todo mês" = repete sem data para acabar. */
      count: z.number().int().min(2, { error: "Escolha pelo menos 2 vezes." }).max(60, { error: "No máximo 60 vezes." }).nullable(),
    })
    .nullable()
    .optional(),
  /** Ao editar uma parcela: levar descrição, categoria, projeto, cartão, quem pagou e observações para as outras (status, valor e data não). */
  applyToSeries: z.boolean().optional(),
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
  const checks: [typeof schema.categories | typeof schema.projects | typeof schema.statuses | typeof schema.creditCards, string | null][] = [
    [schema.categories, data.categoryId],
    [schema.projects, data.projectId],
    [schema.statuses, data.statusId],
    [schema.creditCards, data.cardId],
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
  const between = data.kind === "transfer" || data.kind === "loan";
  if (data.kind === "transfer" && !data.payerId) return { ok: false, error: "Diga quem pagou o acerto." };
  if (data.kind === "loan" && !data.payerId) return { ok: false, error: "Diga quem emprestou." };
  if (between && (data.splits.length !== 1 || data.splits[0].participantId === data.payerId)) {
    return { ok: false, error: data.kind === "loan" ? "Escolha uma outra pessoa que pegou emprestado." : "Escolha uma outra pessoa para o acerto." };
  }
  const splits = normalizeSplits(data);
  const sum = splits.reduce((a, s) => a + s.amountCents, 0);
  if (sum !== data.amountCents) return { ok: false, error: "A soma das partes precisa ser igual ao valor total." };
  const problem = await checkOwnership(auth.householdId, data);
  if (problem) return { ok: false, error: problem };
  if (id) {
    const notAllowed = await checkEditable(auth, [id]);
    if (notAllowed) return { ok: false, error: notAllowed };
  }

  if (data.series && id) return { ok: false, error: "Parcelamento só pode ser escolhido ao criar o lançamento." };
  if (data.series && between) return { ok: false, error: "Empréstimos e acertos não podem ser parcelados." };
  if (data.series?.kind === "installment" && data.series.count === null) return { ok: false, error: "Escolha em quantas parcelas." };
  if (data.series?.kind === "installment" && data.series.count! > 48) return { ok: false, error: "No máximo 48 parcelas." };
  if (data.series?.kind === "installment" && data.amountCents < data.series.count!) return { ok: false, error: "Valor pequeno demais para tantas parcelas." };
  if (data.cardId && between) return { ok: false, error: "Empréstimos e acertos não entram em cartão." };
  if (data.cardId) {
    // Cada pessoa tem os próprios cartões: a compra no cartão é de quem é dono dele.
    const [card] = await getDb()
      .select({ ownerId: schema.creditCards.ownerId })
      .from(schema.creditCards)
      .where(and(eq(schema.creditCards.id, data.cardId), eq(schema.creditCards.householdId, auth.householdId)));
    if (!card) return { ok: false, error: "Cartão inválido." };
    if (card.ownerId && card.ownerId !== data.payerId) return { ok: false, error: "Esse cartão é de outra pessoa. Em “Quem pagou”, escolha o dono do cartão." };
    if (!canManageCard(auth, card)) return { ok: false, error: "Você só pode lançar nos seus cartões." };
  }

  const db = getDb();
  const snapshot: TxSnapshot = {
    description: data.description,
    amountCents: data.amountCents,
    kind: data.kind,
    date: data.date,
    payerId: data.payerId,
    categoryId: data.categoryId,
    projectId: data.projectId,
    statusId: data.statusId,
    cardId: data.cardId,
    splits,
  };
  const values = {
    date: data.date,
    description: data.description,
    amountCents: data.amountCents,
    kind: data.kind,
    payerId: data.payerId,
    categoryId: data.categoryId,
    projectId: data.projectId,
    statusId: data.statusId,
    cardId: data.cardId,
    notes: data.notes || null,
    updatedAt: new Date(),
  };

  // Todo mês, sem fim: guarda o modelo e cria os lançamentos até o mês corrente.
  if (data.series?.kind === "monthly" && data.series.count === null) {
    const [rec] = await db
      .insert(schema.recurringSeries)
      .values({
        householdId: auth.householdId,
        description: values.description,
        amountCents: values.amountCents,
        kind: values.kind,
        payerId: values.payerId,
        categoryId: values.categoryId,
        projectId: values.projectId,
        statusId: values.statusId,
        cardId: values.cardId,
        notes: values.notes,
        splits,
        startDate: data.date,
        createdBy: auth.userId,
      })
      .returning({ id: schema.recurringSeries.id });
    await logActivity(db, auth, { action: "created", data: { tx: snapshot, seriesKind: "monthly", seriesCount: null }, audience: involved(snapshot) });
    await materializeRecurring(auth.householdId);
    const [first] = await db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.seriesId, rec.id), eq(schema.transactions.householdId, auth.householdId)))
      .limit(1);
    revalidatePath("/", "layout");
    return {
      ok: true,
      id: first?.id,
      message: first ? "Salvo. Ele se repete todo mês até você parar." : `Salvo. O primeiro lançamento aparece em ${monthLabel(data.date.slice(0, 7))} e se repete todo mês.`,
    };
  }

  if (data.series) {
    const series = { kind: data.series.kind, count: data.series.count! };
    const seriesId = randomUUID();
    const parts = buildSeries(data.date, series.kind, series.count, data.amountCents, splits);
    if (parts.some((p) => p.amountCents <= 0)) return { ok: false, error: "Valor pequeno demais para tantas parcelas." };
    const firstId = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(schema.transactions)
        .values(
          parts.map((p) => ({
            ...values,
            date: p.date,
            amountCents: p.amountCents,
            householdId: auth.householdId,
            createdBy: auth.userId,
            source: "manual",
            seriesId,
            seriesKind: series.kind,
            seriesIndex: p.index,
            seriesTotal: series.count,
          })),
        )
        .returning({ id: schema.transactions.id, seriesIndex: schema.transactions.seriesIndex });
      const idOf = new Map(rows.map((r) => [r.seriesIndex, r.id]));
      await tx
        .insert(schema.transactionSplits)
        .values(parts.flatMap((p) => p.splits.map((s) => ({ ...s, transactionId: idOf.get(p.index)! }))));
      await logActivity(tx, auth, {
        action: "created",
        transactionId: idOf.get(1)!,
        data: { tx: snapshot, seriesKind: series.kind, seriesCount: series.count },
        audience: involved(snapshot),
      });
      return idOf.get(1)!;
    });
    revalidatePath("/", "layout");
    const what = series.kind === "installment" ? `${series.count} parcelas lançadas.` : `Lançado para ${series.count} meses.`;
    return { ok: true, id: firstId, message: what };
  }

  const before = id ? (await snapshots(db, auth.householdId, [id])).get(id) : undefined;
  const savedId = await db.transaction(async (tx) => {
    let txId = id;
    if (id) {
      const updated = await tx
        .update(schema.transactions)
        .set(values)
        .where(and(eq(schema.transactions.id, id), eq(schema.transactions.householdId, auth.householdId)))
        .returning({ id: schema.transactions.id, seriesId: schema.transactions.seriesId });
      if (updated.length === 0) throw new Error("not-found");
      await tx.delete(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, id));
      const seriesId = updated[0].seriesId;
      if (data.applyToSeries && seriesId) {
        await tx
          .update(schema.transactions)
          .set({
            description: values.description,
            payerId: values.payerId,
            categoryId: values.categoryId,
            projectId: values.projectId,
            cardId: values.cardId,
            notes: values.notes,
            updatedAt: values.updatedAt,
          })
          .where(and(eq(schema.transactions.seriesId, seriesId), eq(schema.transactions.householdId, auth.householdId)));
        // Se for "todo mês" sem fim, os próximos meses também saem com os dados novos.
        await tx
          .update(schema.recurringSeries)
          .set({
            description: values.description,
            payerId: values.payerId,
            categoryId: values.categoryId,
            projectId: values.projectId,
            cardId: values.cardId,
            notes: values.notes,
          })
          .where(and(eq(schema.recurringSeries.id, seriesId), eq(schema.recurringSeries.householdId, auth.householdId)));
      }
    } else {
      const [row] = await tx
        .insert(schema.transactions)
        .values({ ...values, householdId: auth.householdId, createdBy: auth.userId, source: "manual" })
        .returning({ id: schema.transactions.id });
      txId = row.id;
    }
    await tx.insert(schema.transactionSplits).values(splits.map((s) => ({ ...s, transactionId: txId! })));
    if (!id) {
      await logActivity(tx, auth, { action: "created", transactionId: txId, data: { tx: snapshot }, audience: involved(snapshot) });
    } else if (before) {
      const changes = diff(before, snapshot);
      // Quem saiu do lançamento também fica sabendo.
      if (changes.length) await logActivity(tx, auth, { action: "updated", transactionId: id, data: { tx: snapshot, changes }, audience: involved(before, snapshot) });
    }
    return txId!;
  });
  revalidatePath("/", "layout");
  return {
    ok: true,
    id: savedId,
    message: id ? (data.applyToSeries ? "Parcela atualizada e alterações levadas para as outras." : "Lançamento atualizado.") : "Lançamento salvo.",
  };
}

/**
 * Exclui parcelas de uma compra parcelada ou recorrente.
 * - "next": a partir desta (inclusive), útil para cancelar uma assinatura;
 * - "all": todas.
 */
export async function deleteSeries(transactionId: string, scope: "next" | "all"): Promise<ActionResult> {
  const auth = await requireAuth();
  const id = uuid.safeParse(transactionId);
  if (!id.success) return { ok: false, error: "Lançamento inválido." };
  const db = getDb();
  const [row] = await db
    .select({ seriesId: schema.transactions.seriesId, seriesIndex: schema.transactions.seriesIndex, createdBy: schema.transactions.createdBy })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.id, id.data), eq(schema.transactions.householdId, auth.householdId)));
  if (!row?.seriesId) return { ok: false, error: "Este lançamento não faz parte de um parcelamento." };
  if (!canEditTx(auth, row.createdBy)) return { ok: false, error: NOT_YOURS };
  const seriesId = row.seriesId;
  const snap = (await snapshots(db, auth.householdId, [id.data])).get(id.data);
  const removed = await db.transaction(async (tx) => {
    // Recorrência sem fim: para de criar novos meses (e some de vez se apagar todas).
    if (scope === "all") {
      await tx.delete(schema.recurringSeries).where(and(eq(schema.recurringSeries.id, seriesId), eq(schema.recurringSeries.householdId, auth.householdId)));
    } else {
      await tx
        .update(schema.recurringSeries)
        .set({ active: false })
        .where(and(eq(schema.recurringSeries.id, seriesId), eq(schema.recurringSeries.householdId, auth.householdId)));
    }
    const where = [eq(schema.transactions.householdId, auth.householdId), eq(schema.transactions.seriesId, seriesId)];
    if (scope === "next" && row.seriesIndex) where.push(gte(schema.transactions.seriesIndex, row.seriesIndex));
    const gone = await tx.delete(schema.transactions).where(and(...where)).returning({ id: schema.transactions.id });
    if (snap && gone.length) {
      const audience = involved(snap);
      await logActivity(tx, auth, {
        action: "series_deleted",
        data: { tx: snap, items: gone.map(() => ({ d: snap.description, a: audience })) },
        audience,
      });
    }
    return gone;
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `${removed.length} ${removed.length === 1 ? "lançamento excluído" : "lançamentos excluídos"}.` };
}

/**
 * Para uma recorrência sem fim. Os meses que já passaram ficam; os lançamentos com data
 * depois de hoje (já criados para o mês corrente) são excluídos.
 */
export async function stopRecurring(seriesId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const id = uuid.safeParse(seriesId);
  if (!id.success) return { ok: false, error: "Recorrência inválida." };
  const db = getDb();
  const today = todayIn();
  const [rec] = await db
    .select()
    .from(schema.recurringSeries)
    .where(and(eq(schema.recurringSeries.id, id.data), eq(schema.recurringSeries.householdId, auth.householdId)));
  if (!rec) return { ok: false, error: "Recorrência não encontrada." };
  if (!canEditTx(auth, rec.createdBy)) return { ok: false, error: NOT_YOURS };
  const result = await db.transaction(async (tx) => {
    const stopped = await tx
      .update(schema.recurringSeries)
      .set({ active: false })
      .where(and(eq(schema.recurringSeries.id, id.data), eq(schema.recurringSeries.householdId, auth.householdId)))
      .returning({ id: schema.recurringSeries.id });
    if (stopped.length === 0) return null;
    const snap: TxSnapshot = {
      description: rec.description,
      amountCents: rec.amountCents,
      kind: rec.kind,
      date: rec.startDate,
      payerId: rec.payerId,
      categoryId: rec.categoryId,
      projectId: rec.projectId,
      statusId: rec.statusId,
      cardId: rec.cardId,
      splits: rec.splits as TxSnapshot["splits"],
    };
    await logActivity(tx, auth, { action: "stopped", data: { tx: snap }, audience: involved(snap) });
    return tx
      .delete(schema.transactions)
      .where(and(eq(schema.transactions.householdId, auth.householdId), eq(schema.transactions.seriesId, id.data), gt(schema.transactions.date, today)))
      .returning({ id: schema.transactions.id });
  });
  if (!result) return { ok: false, error: "Recorrência não encontrada." };
  revalidatePath("/", "layout");
  return { ok: true, message: result.length ? `Parou de repetir. ${result.length === 1 ? "O lançamento futuro foi excluído" : "Os lançamentos futuros foram excluídos"}.` : "Parou de repetir. Os meses anteriores continuam." };
}

export async function deleteTransactions(ids: string[]): Promise<ActionResult> {
  const auth = await requireAuth();
  const list = z.array(uuid).max(1000).safeParse(ids);
  if (!list.success || list.data.length === 0) return { ok: false, error: "Nada selecionado." };
  const notAllowed = await checkEditable(auth, list.data);
  if (notAllowed) return { ok: false, error: notAllowed };
  const db = getDb();
  const snaps = await snapshots(db, auth.householdId, list.data);
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.transactions)
      .where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.id, list.data)));
    if (snaps.size === 1) {
      const [[tid, snap]] = [...snaps];
      await logActivity(tx, auth, { action: "deleted", transactionId: tid, data: { tx: snap }, audience: involved(snap) });
    } else if (snaps.size > 1) {
      const items = [...snaps.values()].map((x) => ({ d: x.description, a: involved(x) }));
      await logActivity(tx, auth, { action: "deleted", data: { items }, audience: items.flatMap((i) => i.a) });
    }
  });
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
  const notAllowed = await checkEditable(auth, list.data);
  if (notAllowed) return { ok: false, error: notAllowed };
  const snaps = await snapshots(db, auth.householdId, list.data);
  const changed = [...snaps].filter(([, x]) => x.statusId !== statusId);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.transactions)
      .set({ statusId, updatedAt: new Date() })
      .where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.id, list.data)));
    if (changed.length) {
      const items = changed.map(([, x]) => ({ d: x.description, a: involved(x) }));
      await logActivity(tx, auth, {
        action: "status",
        transactionId: changed.length === 1 ? changed[0][0] : null,
        data: { statusId, items, changes: changed.length === 1 ? [{ field: "status", from: changed[0][1].statusId, to: statusId }] : [] },
        audience: items.flatMap((i) => i.a),
      });
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `Marcado como "${status.name}".` };
}

/** Marca o popup "o que mudou" como visto por quem está logado. */
export async function markActivitySeen(): Promise<ActionResult> {
  const auth = await requireAuth();
  await getDb()
    .update(schema.memberships)
    .set({ activitySeenAt: new Date() })
    .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.userId, auth.userId)));
  revalidatePath("/", "layout");
  return { ok: true };
}
