"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gt, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { canEditTx, canManageCard, checkEditable, NOT_YOURS } from "@/lib/access";
import { diff, involved, logActivity, snapshots, type TxSnapshot } from "@/lib/activity";
import { requireAuth, type AuthContext } from "@/lib/auth";
import { buildSeries, invoiceDates, invoiceOf, invoiceRange, monthLabel, shortDate, todayIn } from "@/lib/cards";
import { materializeRecurring } from "@/lib/recurring-server";
import { approvalContext } from "@/lib/approvals";
import { ruleCategory } from "@/lib/rules-server";
import { reviveContacts } from "@/lib/contacts";
import { PREDICTED } from "@/lib/patterns-server";
import { getMembers, getSeriesItems, getTransaction } from "@/lib/queries";
import { firstDateOf, isReal, planSeries, scaleSplits } from "@/lib/series-plan";
import { formatMoney, splitEqually } from "@/lib/money";
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
  if (data.kind === "loan" && !data.payerId) return { ok: false, error: "Diga quem vai receber." };
  if (between && (data.splits.length !== 1 || data.splits[0].participantId === data.payerId)) {
    return { ok: false, error: data.kind === "loan" ? "Escolha uma outra pessoa que deve." : "Escolha uma outra pessoa para o acerto." };
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
  if (data.series && data.kind === "transfer") return { ok: false, error: "Acertos não podem ser parcelados." };
  if (data.series && data.kind === "loan" && data.series.kind !== "installment") return { ok: false, error: "Dívida só pode ser parcelada (não “todo mês”)." };
  if (data.series?.kind === "installment" && data.series.count === null) return { ok: false, error: "Escolha em quantas parcelas." };
  if (data.series?.kind === "installment" && data.series.count! > 48) return { ok: false, error: "No máximo 48 parcelas." };
  if (data.series?.kind === "installment" && data.amountCents < data.series.count!) return { ok: false, error: "Valor pequeno demais para tantas parcelas." };
  if (data.cardId && between) return { ok: false, error: "Dívidas e acertos não entram em cartão." };
  // Receita não tem cartão: o dinheiro que entra é seu, não de um cartão.
  if (data.kind === "income") data.cardId = null;
  // Como estava antes (ao editar): o que não vem do formulário continua igual.
  const existing = id ? await loadExisting(auth.householdId, id) : null;
  if (id && !existing) return { ok: false, error: "Lançamento não encontrado." };
  // Receita é dinheiro que entrou para quem lança. Entrada no nome de outra pessoa só como acerto.
  if (data.kind === "income" && auth.participantId && data.payerId !== auth.participantId && existing?.payerId !== data.payerId) {
    return { ok: false, error: "Receita é sempre sua. Se alguém te pagou uma dívida, lance como Acerto." };
  }
  if (existing?.settlesId) {
    // Acerto que paga uma dívida: só o valor, a data e o texto mudam (quem pagou e para quem ficam).
    data.kind = "transfer";
    data.cardId = null;
    data.payerId = existing.payerId;
    splits.splice(0, splits.length, { participantId: existing.splits[0]?.participantId ?? splits[0].participantId, amountCents: data.amountCents });
  }

  let invoicePaid = false;
  if (data.cardId) {
    // Cada pessoa tem os próprios cartões: no cartão, quem pagou é sempre o dono dele.
    const [card] = await getDb()
      .select({ ownerId: schema.creditCards.ownerId, closingDay: schema.creditCards.closingDay })
      .from(schema.creditCards)
      .where(and(eq(schema.creditCards.id, data.cardId), eq(schema.creditCards.householdId, auth.householdId)));
    if (!card) return { ok: false, error: "Cartão inválido." };
    if (card.ownerId) data.payerId = card.ownerId;
    if (!canManageCard(auth, card)) return { ok: false, error: "Você só pode lançar nos seus cartões." };
    const invoice = invoiceOf(data.date, card.closingDay);
    if (existing && existing.cardId === data.cardId && invoiceOf(existing.date, card.closingDay) === invoice) {
      invoicePaid = existing.invoicePaid;
    } else {
      // Fatura que já foi paga: a compra lançada depois também entrou nela.
      const range = invoiceRange(invoice, card.closingDay);
      const [paid] = await getDb()
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.cardId, data.cardId),
            eq(schema.transactions.invoicePaid, true),
            gte(schema.transactions.date, range.from),
            lte(schema.transactions.date, range.to),
          ),
        )
        .limit(1);
      invoicePaid = !!paid;
    }
  }

  // Sem categoria escolhida: usa as regras de Ajustes → Categorias ("uber" → Transporte).
  data.categoryId = await ruleCategory(auth.householdId, data.kind, data.description, data.categoryId);

  // Membros (com login) no lançamento, além de quem lança: precisam aceitar antes de valer nas dívidas.
  const actx = await approvalContext(auth.householdId);
  const toConfirm = [...new Set([data.payerId, ...splits.map((x) => x.participantId)])].filter((p): p is string => !!p && p !== auth.participantId && actx.members.has(p));
  const askNote = !id && toConfirm.length ? ` ${toConfirm.length === 1 ? "A outra pessoa precisa" : `${toConfirm.length} pessoas precisam`} aceitar para valer nas dívidas.` : "";
  const db = getDb();
  const snapshot: TxSnapshot = {
    description: data.description,
    amountCents: data.amountCents,
    kind: data.kind,
    date: data.date,
    payerId: data.payerId,
    categoryId: data.categoryId,
    projectId: data.projectId,
    settled: existing?.settled ?? false,
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
    cardId: data.cardId,
    invoicePaid,
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
      message: (first ? "Salvo. Ele se repete todo mês até você parar." : `Salvo. Começa em ${monthLabel(data.date.slice(0, 7))} e se repete todo mês.`) + askNote,
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
            invoicePaid: false,
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
    return { ok: true, id: firstId, message: what + askNote };
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
    // Quem já pagou a própria parte (com um acerto) continua quitado.
    const paidBy = new Map((existing?.splits ?? []).map((x) => [x.participantId, x.paidById]));
    await tx.insert(schema.transactionSplits).values(splits.map((s) => ({ ...s, paidById: paidBy.get(s.participantId) ?? null, transactionId: txId! })));
    if (!id) {
      await logActivity(tx, auth, { action: "created", transactionId: txId, data: { tx: snapshot }, audience: involved(snapshot) });
    } else if (before) {
      const changes = diff(before, snapshot);
      // Quem saiu do lançamento também fica sabendo.
      if (changes.length) await logActivity(tx, auth, { action: "updated", transactionId: id, data: { tx: snapshot, changes }, audience: involved(before, snapshot) });
    }
    return txId!;
  });
  // Contato escondido (parado e quite) volta às listas, porque tem lançamento novo.
  await reviveContacts(auth.householdId, [...new Set([data.payerId, ...splits.map((x) => x.participantId)].filter((x): x is string => !!x))]);
  revalidatePath("/", "layout");
  return {
    ok: true,
    id: savedId,
    message: id ? (data.applyToSeries ? "Parcela atualizada e alterações levadas para as outras." : "Lançamento atualizado.") : "Lançamento salvo." + askNote,
  };
}

async function loadExisting(householdId: string, id: string) {
  const db = getDb();
  const t = schema.transactions;
  const [row] = await db
    .select({ payerId: t.payerId, cardId: t.cardId, date: t.date, invoicePaid: t.invoicePaid, settled: t.settled, settlesId: t.settlesId })
    .from(t)
    .where(and(eq(t.id, id), eq(t.householdId, householdId)));
  if (!row) return null;
  const splits = await db
    .select({ participantId: schema.transactionSplits.participantId, paidById: schema.transactionSplits.paidById })
    .from(schema.transactionSplits)
    .where(eq(schema.transactionSplits.transactionId, id));
  return { ...row, splits };
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
  // Pagamentos ligados que vão sumir: depois, a dívida que eles pagavam pode precisar reabrir.
  const origs = [
    ...new Set(
      (await db.select({ s: schema.transactions.settlesId }).from(schema.transactions).where(inArray(schema.transactions.id, list.data)))
        .map((x) => x.s)
        .filter((x): x is string => !!x && !list.data.includes(x)),
    ),
  ];
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.transactions)
      .where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.id, list.data)));
    // Desfez um pagamento parcial de uma parte já quitada: se o que sobrou não cobre a parte, ela reabre.
    for (const orig of origs.length ? await loadDebtTx(auth.householdId, origs) : []) {
      for (const sp of orig.splits) {
        if (!sp.paidById) continue;
        const [closing] = await tx.select({ amountCents: schema.transactions.amountCents }).from(schema.transactions).where(eq(schema.transactions.id, sp.paidById));
        const total = (closing?.amountCents ?? 0) + (await partialPaid(tx, orig, sp.participantId));
        if (total < sp.amountCents) {
          await tx.update(schema.transactionSplits).set({ paidById: null }).where(and(eq(schema.transactionSplits.transactionId, orig.id), eq(schema.transactionSplits.participantId, sp.participantId)));
        }
      }
    }
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

type Conn = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type DebtTx = { id: string; description: string; kind: string; payerId: string | null; settlesId: string | null };

/**
 * Cria o acerto que paga a parte de uma pessoa num lançamento: a dívida dela some e o acerto
 * fica ligado ao lançamento. Se o valor pago for maior que o devido, a diferença é lucro.
 * Despesa e empréstimo: a pessoa paga para quem pagou. Receita: quem recebeu repassa para a pessoa.
 */
async function createPayment(tx: Conn, auth: AuthContext, orig: DebtTx, participantId: string, amountCents: number, date: string, closes = true) {
  const income = orig.kind === "income";
  const from = income ? orig.payerId! : participantId;
  const to = income ? participantId : orig.payerId!;
  const [row] = await tx
    .insert(schema.transactions)
    .values({
      householdId: auth.householdId,
      date,
      description: `Pagamento: ${orig.description}`.slice(0, 200),
      amountCents,
      kind: "transfer",
      payerId: from,
      settlesId: orig.id,
      source: "manual",
      createdBy: auth.userId,
    })
    .returning({ id: schema.transactions.id });
  await tx.insert(schema.transactionSplits).values({ transactionId: row.id, participantId: to, amountCents });
  // Parcial: a parte continua aberta, só com menos para pagar. Quitou: a parte sai das dívidas.
  if (closes) {
    await tx
      .update(schema.transactionSplits)
      .set({ paidById: row.id })
      .where(and(eq(schema.transactionSplits.transactionId, orig.id), eq(schema.transactionSplits.participantId, participantId)));
  }
  return row.id;
}

/** Quanto já foi pago em pagamentos parciais de uma parte (acertos ligados que não a quitaram). */
async function partialPaid(conn: Conn | ReturnType<typeof getDb>, orig: DebtTx, participantId: string) {
  const t = schema.transactions;
  const pays = await conn.select({ id: t.id, amountCents: t.amountCents, payerId: t.payerId }).from(t).where(eq(t.settlesId, orig.id));
  if (pays.length === 0) return 0;
  const closing = new Set(
    (await conn.select({ paidById: schema.transactionSplits.paidById }).from(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, orig.id)))
      .map((x) => x.paidById)
      .filter(Boolean),
  );
  const paySplits = await conn.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, pays.map((p) => p.id)));
  const ofPerson = (p: { id: string; payerId: string | null }) => (orig.kind === "income" ? paySplits.find((x) => x.transactionId === p.id)?.participantId : p.payerId);
  return pays.filter((p) => !closing.has(p.id) && ofPerson(p) === participantId).reduce((a, p) => a + p.amountCents, 0);
}

async function loadDebtTx(householdId: string, ids: string[]) {
  const t = schema.transactions;
  const rows = await getDb()
    .select({ id: t.id, description: t.description, kind: t.kind, payerId: t.payerId, settlesId: t.settlesId, createdBy: t.createdBy })
    .from(t)
    .where(and(eq(t.householdId, householdId), inArray(t.id, ids)));
  const splits = await getDb().select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, ids));
  return rows.map((r) => ({ ...r, splits: splits.filter((x) => x.transactionId === r.id) }));
}

const PaySchema = z.object({
  transactionId: uuid,
  participantId: uuid,
  amountCents: z.number().int().positive({ error: "O valor pago precisa ser maior que zero." }).max(1_000_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Marca como paga a parte de uma pessoa num lançamento, com o valor que ela pagou de verdade.
 * Pagou a mais: a diferença é lucro. Pagou a menos: é um pagamento parcial, e o mesmo lançamento
 * continua em aberto com o que falta (não vira lançamento novo nem desconto).
 */
export async function payDebt(input: z.input<typeof PaySchema>): Promise<ActionResult> {
  const auth = await requireAuth();
  const parsed = PaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const [orig] = await loadDebtTx(auth.householdId, [d.transactionId]);
  if (!orig || !orig.payerId || orig.kind === "transfer" || orig.settlesId) return { ok: false, error: "Lançamento sem dívida para pagar." };
  const split = orig.splits.find((x) => x.participantId === d.participantId && x.participantId !== orig.payerId && x.amountCents > 0);
  if (!split) return { ok: false, error: "Essa pessoa não deve nada neste lançamento." };
  if (split.paidById) return { ok: false, error: "Essa parte já foi paga." };
  // Quem lançou, quem administra ou as duas pessoas da dívida podem registrar o pagamento.
  const involvedHere = auth.participantId === orig.payerId || auth.participantId === d.participantId;
  if (!canEditTx(auth, orig.createdBy) && !involvedHere) return { ok: false, error: NOT_YOURS };
  const db = getDb();
  const date = d.date ?? todayIn();
  // Já pagou parte antes: o que falta é o valor da parte menos os parciais.
  const before = await partialPaid(getDb(), orig, d.participantId);
  const left = split.amountCents - before;
  const closes = d.amountCents >= left;
  const restCents = closes ? 0 : left - d.amountCents;
  await db.transaction(async (tx) => {
    const payId = await createPayment(tx, auth, orig, d.participantId, d.amountCents, date, closes);
    const audience = [orig.payerId!, d.participantId];
    await logActivity(tx, auth, {
      action: "status",
      transactionId: orig.id,
      data: { settled: closes, paidCents: d.amountCents, owedCents: closes ? left : d.amountCents, restCents, items: [{ d: orig.description, a: audience }], changes: [] },
      audience,
    });
    return payId;
  });
  revalidatePath("/", "layout");
  const diff = d.amountCents - left;
  const money = (c: number) => formatMoney(c, auth.currency);
  // A outra pessoa tem login: o pagamento só vale depois que ela confirmar.
  const other = auth.participantId === orig.payerId ? d.participantId : orig.payerId!;
  const ctx = await approvalContext(auth.householdId);
  const wait = other !== auth.participantId && ctx.members.has(other) ? " Falta a outra pessoa confirmar em “Para confirmar”." : "";
  const result: ActionResult = {
    ok: true,
    message: restCents > 0 ? `Pagou ${money(d.amountCents)}. Ainda falta ${money(restCents)}.` : diff > 0 ? `Pago, com ${money(diff)} de lucro.` : "Pago. Dívida quitada.",
  };
  if (wait) result.message += wait;
  return result;
}

/**
 * Em vários lançamentos de uma vez: marca como pagas todas as partes em aberto (com o valor exato devido)
 * ou desfaz os pagamentos (apaga os acertos ligados e a dívida volta).
 */
export async function setTransactionsSettled(ids: string[], settled: boolean): Promise<ActionResult> {
  const auth = await requireAuth();
  const list = z.array(uuid).max(1000).safeParse(ids);
  if (!list.success || list.data.length === 0 || typeof settled !== "boolean") return { ok: false, error: "Nada selecionado." };
  const db = getDb();
  const notAllowed = await checkEditable(auth, list.data);
  if (notAllowed) return { ok: false, error: notAllowed };
  const rows = (await loadDebtTx(auth.householdId, list.data)).filter((r) => r.kind !== "transfer" && !r.settlesId && r.payerId);
  const today = todayIn();
  let n = 0;
  await db.transaction(async (tx) => {
    const items: { d: string; a: string[] }[] = [];
    for (const r of rows) {
      const owed = r.splits.filter((x) => x.participantId !== r.payerId && x.amountCents > 0);
      if (settled) {
        const open = owed.filter((x) => !x.paidById);
        // Quita o que falta de cada parte (descontando pagamentos parciais).
        for (const x of open) await createPayment(tx, auth, r, x.participantId, Math.max(1, x.amountCents - (await partialPaid(tx, r, x.participantId))), today);
        if (open.length) items.push({ d: r.description, a: [r.payerId!, ...open.map((x) => x.participantId)] });
        n += open.length ? 1 : 0;
      } else {
        // Desfaz todos os pagamentos ligados (os que quitaram e os parciais).
        const payIds = (await tx.select({ id: schema.transactions.id }).from(schema.transactions).where(eq(schema.transactions.settlesId, r.id))).map((x) => x.id);
        if (payIds.length) await tx.delete(schema.transactions).where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.id, payIds)));
        // Modelo antigo: "Já acertado" sem acerto.
        await tx.update(schema.transactions).set({ settled: false }).where(eq(schema.transactions.id, r.id));
        if (payIds.length) {
          items.push({ d: r.description, a: [r.payerId!, ...owed.map((x) => x.participantId)] });
          n += 1;
        }
      }
    }
    if (items.length) {
      await logActivity(tx, auth, {
        action: "status",
        transactionId: items.length === 1 ? rows.find((r) => r.description === items[0].d)?.id ?? null : null,
        data: { settled, items, changes: [] },
        audience: items.flatMap((i) => i.a),
      });
    }
  });
  if (n === 0) return { ok: true, message: settled ? "Não havia nada em aberto." : "Não havia pagamento para desfazer." };
  revalidatePath("/", "layout");
  return { ok: true, message: settled ? (n === 1 ? "Marcado como pago." : `${n} lançamentos marcados como pagos.`) : n === 1 ? "Pagamento desfeito: a dívida voltou." : `${n} pagamentos desfeitos.` };
}

/** Marca uma fatura do cartão como paga (ou não): as compras dela passam a "Pago". */
export async function setInvoicePaid(cardId: string, invoice: string, paid: boolean): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!uuid.safeParse(cardId).success || !/^\d{4}-\d{2}$/.test(invoice)) return { ok: false, error: "Fatura inválida." };
  const db = getDb();
  const [card] = await db
    .select({ ownerId: schema.creditCards.ownerId, closingDay: schema.creditCards.closingDay, dueDay: schema.creditCards.dueDay, name: schema.creditCards.name })
    .from(schema.creditCards)
    .where(and(eq(schema.creditCards.id, cardId), eq(schema.creditCards.householdId, auth.householdId)));
  if (!card) return { ok: false, error: "Cartão inválido." };
  if (!canManageCard(auth, card)) return { ok: false, error: "Só o dono do cartão pode marcar a fatura." };
  const dueLabel = `que vence ${shortDate(invoiceDates(invoice, card).due)}`;
  const range = invoiceRange(invoice, card.closingDay);
  const t = schema.transactions;
  const changed = await db
    .update(t)
    .set({ invoicePaid: paid })
    .where(and(eq(t.householdId, auth.householdId), eq(t.cardId, cardId), gte(t.date, range.from), lte(t.date, range.to)))
    .returning({ id: t.id });
  if (changed.length === 0) return { ok: false, error: "Essa fatura não tem compras." };
  revalidatePath("/", "layout");
  return { ok: true, message: paid ? `Fatura ${dueLabel} paga: as compras dela agora estão como pagas.` : `Fatura ${dueLabel} voltou a ficar em aberto.` };
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

const ReshapeSchema = z.object({
  total: z.number().int(),
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Escolha a data da 1ª parcela." }),
  amountCents: z.number().int().positive().max(1_000_000_000).nullable(),
});

/**
 * Muda uma compra parcelada depois de criada: número de parcelas, data da 1ª e valor de cada uma.
 * As parcelas que vieram do extrato não mudam (são reais); as outras se ajustam (ver lib/series-plan.ts).
 */
export async function reshapeSeries(transactionId: string, input: z.input<typeof ReshapeSchema>): Promise<ActionResult> {
  const auth = await requireAuth();
  const id = uuid.safeParse(transactionId);
  const parsed = ReshapeSchema.safeParse(input);
  if (!id.success) return { ok: false, error: "Lançamento inválido." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = getDb();
  const t = schema.transactions;
  const [ref] = await db.select().from(t).where(and(eq(t.id, id.data), eq(t.householdId, auth.householdId)));
  if (!ref?.seriesId || !ref.seriesTotal) return { ok: false, error: "Este lançamento não tem um número de parcelas para mudar." };
  const items = await db
    .select({ id: t.id, index: t.seriesIndex, date: t.date, amountCents: t.amountCents, source: t.source })
    .from(t)
    .where(and(eq(t.householdId, auth.householdId), eq(t.seriesId, ref.seriesId)));
  const notAllowed = await checkEditable(auth, items.map((x) => x.id));
  if (notAllowed) return { ok: false, error: notAllowed };
  const plan = planSeries(
    items.map((x) => ({ ...x, index: x.index ?? 0 })),
    parsed.data,
  );
  if (plan.error) return { ok: false, error: plan.error };
  const refSplits = await db
    .select({ participantId: schema.transactionSplits.participantId, amountCents: schema.transactionSplits.amountCents })
    .from(schema.transactionSplits)
    .where(eq(schema.transactionSplits.transactionId, ref.id));
  const anyReal = items.some((x) => isReal(x.source));
  let created = 0;
  let moved = 0;
  await db.transaction(async (tx) => {
    for (const s of plan.steps) {
      if (s.action === "update") {
        const before = items.find((x) => x.id === s.id)!;
        await tx
          .update(t)
          .set({ date: s.date, amountCents: s.amountCents, seriesTotal: parsed.data.total, ...(before.date !== s.date ? { invoicePaid: false } : {}), updatedAt: new Date() })
          .where(eq(t.id, s.id));
        if (before.amountCents !== s.amountCents) {
          // Mesma divisão, no novo valor; quem já pagou a parte continua pago.
          const old = await tx.select().from(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, s.id));
          const scaled = scaleSplits(old, s.amountCents);
          for (const [k, x] of old.entries()) {
            await tx
              .update(schema.transactionSplits)
              .set({ amountCents: scaled[k].amountCents })
              .where(and(eq(schema.transactionSplits.transactionId, s.id), eq(schema.transactionSplits.participantId, x.participantId)));
          }
        }
        moved++;
      } else if (s.action === "keep") {
        await tx.update(t).set({ seriesTotal: parsed.data.total }).where(eq(t.id, s.id));
      } else {
        const [row] = await tx
          .insert(t)
          .values({
            householdId: auth.householdId,
            date: s.date,
            description: ref.description,
            amountCents: s.amountCents,
            kind: ref.kind,
            payerId: ref.payerId,
            categoryId: ref.categoryId,
            projectId: ref.projectId,
            cardId: ref.cardId,
            notes: ref.notes,
            source: anyReal ? PREDICTED : "manual",
            createdBy: ref.createdBy ?? auth.userId,
            seriesId: ref.seriesId,
            seriesKind: ref.seriesKind,
            seriesIndex: s.index,
            seriesTotal: parsed.data.total,
          })
          .returning({ id: t.id });
        const splits = scaleSplits(refSplits, s.amountCents).filter((x) => x.amountCents > 0);
        if (splits.length) await tx.insert(schema.transactionSplits).values(splits.map((x) => ({ ...x, transactionId: row.id })));
        created++;
      }
    }
    if (plan.remove.length) {
      await tx.delete(t).where(and(eq(t.householdId, auth.householdId), inArray(t.id, plan.remove.map((x) => x.id))));
    }
    const audience = involved({ payerId: ref.payerId, splits: refSplits });
    await logActivity(tx, auth, {
      action: "bulk",
      data: { items: [{ d: ref.description, a: audience }], fields: ["parcelas"] },
      audience,
    });
  });
  revalidatePath("/", "layout");
  const parts = [
    created ? `${created} ${created === 1 ? "parcela criada" : "parcelas criadas"}` : null,
    plan.remove.length ? `${plan.remove.length} ${plan.remove.length === 1 ? "apagada" : "apagadas"}` : null,
    moved ? `${moved} ${moved === 1 ? "ajustada" : "ajustadas"}` : null,
  ].filter(Boolean);
  return { ok: true, message: `Parcelamento atualizado: ${parsed.data.total} parcelas.${parts.length ? ` ${parts.join(", ")}.` : ""}` };
}

/**
 * Transforma parcelas (ou "todo mês por N meses") em "todo mês, sem data para acabar":
 * a série vira uma recorrência, e os próximos meses passam a ser criados sozinhos quando chegam.
 */
export async function makeSeriesEndless(transactionId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const id = uuid.safeParse(transactionId);
  if (!id.success) return { ok: false, error: "Lançamento inválido." };
  const db = getDb();
  const t = schema.transactions;
  const [ref] = await db.select().from(t).where(and(eq(t.id, id.data), eq(t.householdId, auth.householdId)));
  if (!ref?.seriesId || !ref.seriesTotal) return { ok: false, error: "Este lançamento não tem um número de parcelas para mudar." };
  if (ref.kind === "loan" || ref.kind === "transfer") return { ok: false, error: "Dívidas e acertos não se repetem." };
  const [exists] = await db.select({ id: schema.recurringSeries.id }).from(schema.recurringSeries).where(eq(schema.recurringSeries.id, ref.seriesId));
  if (exists) return { ok: false, error: "Esta série já se repete todo mês." };
  const items = await db
    .select({ id: t.id, index: t.seriesIndex, date: t.date, amountCents: t.amountCents, source: t.source })
    .from(t)
    .where(and(eq(t.householdId, auth.householdId), eq(t.seriesId, ref.seriesId)));
  const notAllowed = await checkEditable(auth, items.map((x) => x.id));
  if (notAllowed) return { ok: false, error: notAllowed };
  const sorted = items.map((x) => ({ ...x, index: x.index ?? 0 })).sort((a, b) => a.index - b.index);
  const last = sorted[sorted.length - 1];
  const startDate = firstDateOf(sorted) ?? ref.date;
  const refSplits = await db
    .select({ participantId: schema.transactionSplits.participantId, amountCents: schema.transactionSplits.amountCents })
    .from(schema.transactionSplits)
    .where(eq(schema.transactionSplits.transactionId, ref.id));
  await db.transaction(async (tx) => {
    // A recorrência usa o mesmo id da série: os lançamentos que já existem continuam ligados a ela.
    await tx.insert(schema.recurringSeries).values({
      id: ref.seriesId!,
      householdId: auth.householdId,
      description: ref.description,
      amountCents: last.amountCents,
      kind: ref.kind,
      payerId: ref.payerId,
      categoryId: ref.categoryId,
      projectId: ref.projectId,
      cardId: ref.kind === "income" ? null : ref.cardId,
      notes: ref.notes,
      splits: scaleSplits(refSplits, last.amountCents),
      startDate,
      nextIndex: last.index + 1,
      createdBy: ref.createdBy ?? auth.userId,
    });
    await tx.update(t).set({ seriesKind: "monthly", seriesTotal: null }).where(and(eq(t.householdId, auth.householdId), eq(t.seriesId, ref.seriesId!)));
    const audience = involved({ payerId: ref.payerId, splits: refSplits });
    await logActivity(tx, auth, { action: "bulk", data: { items: [{ d: ref.description, a: audience }], fields: ["repetição"] }, audience });
  });
  await materializeRecurring(auth.householdId);
  revalidatePath("/", "layout");
  return { ok: true, message: "Agora se repete todo mês, sem fim." };
}

/** Tudo o que a janela de edição precisa de um lançamento (abre por cima da página, sem navegar). */
export async function loadTxForEdit(id: string) {
  const auth = await requireAuth();
  if (!uuid.safeParse(id).success) return null;
  const tx = await getTransaction(auth, id);
  if (!tx) return null;
  const canEdit = canEditTx(auth, tx.createdBy);
  const members = await getMembers(auth.householdId);
  const series = tx.seriesId && tx.seriesTotal && canEdit ? await getSeriesItems(auth, tx.seriesId) : null;
  return {
    tx,
    canEdit,
    createdByName: members.find((m) => m.userId === tx.createdBy)?.name ?? null,
    series: series ? { items: series, total: tx.seriesTotal!, monthly: tx.seriesKind === "monthly" } : null,
  };
}
