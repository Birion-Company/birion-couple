import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, getTableColumns, gt, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { cardsFor, isAdmin, txScope, type Viewer } from "./access";
import { approvalContext, approvalKey, approvalStates, type ApprovalInput, type ApprovalState } from "./approvals";
import { computeBalances, pairEffects, pairwiseFor, pairwiseSettlements, suggestSettlements, type Settlement, type TransactionKind } from "./balances";
import { stateFromParam } from "./tx-state";
import { monthRange, parseFilters, type Filters } from "./filters";
import { addDaysIso, addMonthsKey, competenceMonth, todayIn } from "./cards";
import { merchantKey, recurringMerchants } from "./import/patterns";
import { dueOccurrences, endOfMonth } from "./recurring";
import { ensureRecurring } from "./recurring-server";
import { lastUsedByPerson } from "./contacts";

const t = schema.transactions;

// Pessoas sem a foto em si (pesada): a foto vem por /api/avatar/pessoa/<id>.
const { photoData: _photo, ...participantColumns } = getTableColumns(schema.participants);
void _photo;

export async function getLookups(householdId: string) {
  const db = getDb();
  const [participants, categories, projects, statuses, cards] = await Promise.all([
    db.select(participantColumns).from(schema.participants).where(eq(schema.participants.householdId, householdId)).orderBy(asc(schema.participants.sortOrder), asc(schema.participants.createdAt)),
    db.select().from(schema.categories).where(eq(schema.categories.householdId, householdId)).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name)),
    db.select().from(schema.projects).where(eq(schema.projects.householdId, householdId)).orderBy(asc(schema.projects.name)),
    db.select().from(schema.statuses).where(eq(schema.statuses.householdId, householdId)).orderBy(asc(schema.statuses.sortOrder), asc(schema.statuses.createdAt)),
    db.select().from(schema.creditCards).where(eq(schema.creditCards.householdId, householdId)).orderBy(asc(schema.creditCards.createdAt)),
  ]);
  // Foto de perfil de quem tem login (a pessoa ligada a um usuário com foto).
  const photos = await db
    .select({ participantId: schema.memberships.participantId, userId: schema.users.id, at: schema.users.avatarUpdatedAt })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.householdId, householdId), isNotNull(schema.users.avatarUpdatedAt)));
  const photoOf = new Map(photos.map((x) => [x.participantId, `/api/avatar/${x.userId}?v=${x.at!.getTime()}`]));
  // Quem tem login: a foto do perfil. Quem não tem: a foto cadastrada em Ajustes → Pessoas (se houver).
  const [loginRows, lastUsed] = await Promise.all([
    db.select({ id: schema.memberships.participantId }).from(schema.memberships).where(eq(schema.memberships.householdId, householdId)),
    // Última vez que cada pessoa apareceu num lançamento: ordena os contatos recentes nas listas.
    lastUsedByPerson(householdId),
  ]);
  const logins = new Set(loginRows.map((m) => m.id));
  return {
    participants: participants.map((x) => ({
      ...x,
      hasLogin: logins.has(x.id),
      lastUsed: lastUsed.get(x.id) ?? null,
      avatarUrl: photoOf.get(x.id) ?? (x.photoUpdatedAt && !logins.has(x.id) ? `/api/avatar/pessoa/${x.id}?v=${x.photoUpdatedAt.getTime()}` : null),
    })),
    categories,
    projects,
    statuses,
    cards,
  };
}

export type Lookups = Awaited<ReturnType<typeof getLookups>>;

/** Listas da família como esta pessoa deve vê-las: cartões só os dela (quem administra vê todos). */
export async function getLookupsFor(viewer: Viewer): Promise<Lookups> {
  const l = await getLookups(viewer.householdId);
  return { ...l, cards: cardsFor(viewer, l.cards) };
}

/** Último dia do mês atual: em "Todo o período", o que vem depois só aparece se pedir. */
const endOfThisMonth = () => endOfMonth(todayIn());

/** Condição SQL de cada status calculado (mesma regra de txState, em lib/tx-state.ts). */
function stateWhere(state: NonNullable<ReturnType<typeof stateFromParam>>): SQL {
  const owes = sql`exists (select 1 from "transaction_splits" s where s."transactionId" = "transactions"."id" and s."participantId" <> "transactions"."payerId" and s."amountCents" > 0 and s."paidById" is null)`;
  const notTransfer = sql`"transactions"."kind" <> 'transfer'`;
  const onCard = and(isNotNull(t.cardId), sql`"transactions"."kind" <> 'loan'`)!;
  const offCard = or(isNull(t.cardId), eq(t.kind, "loan"))!;
  switch (state) {
    case "on-card":
      return and(notTransfer, onCard, eq(t.invoicePaid, false))!;
    case "to-pay":
      return and(notTransfer, offCard, isNull(t.payerId))!;
    case "to-settle":
      return and(notTransfer, offCard, isNotNull(t.payerId), eq(t.settled, false), owes)!;
    case "paid":
      return or(
        eq(t.kind, "transfer"),
        and(onCard, eq(t.invoicePaid, true)),
        and(offCard, isNotNull(t.payerId), or(eq(t.settled, true), sql`not ${owes}`)),
      )!;
  }
}

/**
 * Primeiro dia do mês em que o lançamento é pago: sem cartão, o mês da data; no cartão, o mês em que vence
 * a fatura em que ele cai (mesma regra de competenceMonth, em lib/cards.ts).
 */
const competenceSql = sql`coalesce(
  (select (
    (case when extract(day from "transactions"."date") >= least(c."closingDay", extract(day from date_trunc('month', "transactions"."date") + interval '1 month - 1 day'))
      then date_trunc('month', "transactions"."date") + interval '1 month'
      else date_trunc('month', "transactions"."date") end)
    + (case when c."dueDay" > c."closingDay" then interval '0 month' else interval '1 month' end)
  )::date from "credit_cards" c where c."id" = "transactions"."cardId"),
  date_trunc('month', "transactions"."date")::date
)`;

function whereFor(viewer: Viewer, f: Filters, opts: { includeFuture?: boolean; withPayments?: boolean } = {}): SQL {
  // Pagamento de uma dívida ("Recebi/Paguei") não é um movimento à parte: aparece dentro do lançamento
  // que ele paga (abatendo o valor), não como uma linha nova nas listas. (As contas do painel ainda o usam.)
  const parts: (SQL | undefined)[] = opts.withPayments ? [] : [isNull(t.settlesId)];
  if (f.competence) {
    // No cartão, a compra pode ser de até 2 meses antes do mês em que a fatura vence.
    parts.push(gte(t.date, `${addMonthsKey(f.competence, -2)}-01`), lte(t.date, endOfMonth(`${f.competence}-01`)));
    parts.push(sql`${competenceSql} = ${`${f.competence}-01`}::date`);
  } else {
    if (f.from) parts.push(gte(t.date, f.from));
    if (f.to) parts.push(lte(t.date, f.to));
  }
  if (f.period === "tudo" && !f.future && !opts.includeFuture) parts.push(lte(t.date, endOfThisMonth()));
  if (f.category === "sem") parts.push(isNull(t.categoryId));
  else if (f.category) parts.push(eq(t.categoryId, f.category));
  if (f.project) parts.push(eq(t.projectId, f.project));
  const state = stateFromParam(f.status);
  if (state) parts.push(stateWhere(state));
  if (f.card) parts.push(eq(t.cardId, f.card));
  if (f.q) parts.push(or(ilike(t.description, `%${f.q}%`), ilike(t.notes, `%${f.q}%`)));
  if (f.person) {
    const hasPart = sql`exists (select 1 from "transaction_splits" s where s."transactionId" = "transactions"."id" and s."participantId" = ${f.person} and s."amountCents" > 0)`;
    if (f.role === "dele") {
      // Só o que é da pessoa: ela tem parte na conta (o que comprou para outra pessoa fica de fora).
      parts.push(hasPart);
    } else if (f.role === "a-receber") {
      // O que as outras pessoas ainda têm que dar a ela: ela pagou e a conta é (também) delas, sem pagamento ainda.
      const stillOwe = sql`exists (select 1 from "transaction_splits" s where s."transactionId" = "transactions"."id" and s."participantId" <> ${f.person} and s."amountCents" > 0 and s."paidById" is null)`;
      parts.push(eq(t.payerId, f.person), inArray(t.kind, ["expense", "loan"]), eq(t.settled, false), stillOwe);
    } else {
      parts.push(
        or(
          eq(t.payerId, f.person),
          sql`exists (select 1 from "transaction_splits" s where s."transactionId" = "transactions"."id" and s."participantId" = ${f.person})`,
        ),
      );
    }
  }
  return txScope(viewer, ...parts);
}

export type TxRow = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  kind: TransactionKind;
  payerId: string | null;
  categoryId: string | null;
  projectId: string | null;
  statusId: string | null;
  settled: boolean;
  invoicePaid: boolean;
  /** Acerto que paga a dívida de outro lançamento. */
  settlesId: string | null;
  /** Para acertos ligados: o lançamento pago e quanto era devido (o resto é lucro ou desconto). */
  /** owedCents: a parte toda; otherPaidCents: o que já tinha sido pago antes; closes: este pagamento quitou a parte. */
  settles: { txId: string; description: string; owedCents: number; otherPaidCents: number; closes: boolean } | null;
  notes: string | null;
  source: string;
  cardId: string | null;
  seriesId: string | null;
  seriesKind: string | null;
  seriesIndex: number | null;
  seriesTotal: number | null;
  /** Quem criou (usuário); só essa pessoa ou quem administra pode alterar. */
  createdBy: string | null;
  householdId: string;
  createdAt: Date;
  /** Membros que ainda não aceitaram ou recusaram (ver lib/approvals.ts); nulo = valendo. */
  approval: ApprovalState | null;
  /** Esperando confirmação ou recusado: ainda não mexe nas dívidas. */
  blocked: boolean;
  /** Compra recorrente: o mesmo estabelecimento aparece em meses diferentes (só na lista de lançamentos). */
  recurring?: boolean;
  /**
   * paidById/paidCents: o acerto que pagou esta parte e quanto foi pago nele.
   * partCents: já pago em pagamentos parciais (a parte continua aberta com o que falta).
   * partials: os pagamentos parciais (para o histórico e para desfazer).
   * pendingPayId: pagamento registrado que a outra pessoa ainda não confirmou (não conta até ela aceitar).
   */
  splits: {
    participantId: string;
    amountCents: number;
    paidById: string | null;
    paidCents: number | null;
    partCents?: number;
    partials?: { id: string; cents: number; pending: boolean }[];
    pendingPayId?: string | null;
  }[];
};

type BaseRow = Omit<TxRow, "splits" | "settles" | "approval" | "blocked">;

async function attachSplits(rows: BaseRow[]): Promise<TxRow[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const splits: { transactionId: string; participantId: string; amountCents: number; paidById: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    splits.push(
      ...(await db
        .select()
        .from(schema.transactionSplits)
        .where(inArray(schema.transactionSplits.transactionId, ids.slice(i, i + 500)))),
    );
  }
  // Pagamentos ligados a estes lançamentos ("Recebi/Paguei"): o que quitou uma parte e os parciais.
  const linked: { id: string; settlesId: string | null; seriesId: string | null; kind: string; payerId: string | null; amountCents: number; createdBy: string | null; createdAt: Date }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    linked.push(
      ...(await db
        .select({ id: t.id, settlesId: t.settlesId, seriesId: t.seriesId, kind: t.kind, payerId: t.payerId, amountCents: t.amountCents, createdBy: t.createdBy, createdAt: t.createdAt })
        .from(t)
        .where(inArray(t.settlesId, ids.slice(i, i + 500)))),
    );
  }
  // Lançamentos que estes acertos pagam (quando a lista tem o acerto e não o original).
  const origIds = [...new Set(rows.map((r) => r.settlesId).filter((x): x is string => !!x))];
  const origs: { id: string; description: string; kind: string; payerId: string | null }[] = [];
  const origSplits: typeof splits = [];
  const siblings: typeof linked = [];
  for (let i = 0; i < origIds.length; i += 500) {
    const part = origIds.slice(i, i + 500);
    origs.push(...(await db.select({ id: t.id, description: t.description, kind: t.kind, payerId: t.payerId }).from(t).where(inArray(t.id, part))));
    origSplits.push(...(await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, part))));
    siblings.push(
      ...(await db
        .select({ id: t.id, settlesId: t.settlesId, seriesId: t.seriesId, kind: t.kind, payerId: t.payerId, amountCents: t.amountCents, createdBy: t.createdBy, createdAt: t.createdAt })
        .from(t)
        .where(inArray(t.settlesId, part))),
    );
  }
  const payIdsAll = [...new Set([...linked, ...siblings].map((x) => x.id))];
  const paySplits: typeof splits = [];
  for (let i = 0; i < payIdsAll.length; i += 500) {
    paySplits.push(...(await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, payIdsAll.slice(i, i + 500)))));
  }
  const allSplits = [...splits, ...origSplits, ...paySplits];
  const kindOf = new Map([...rows, ...origs].map((r) => [r.id, r.kind]));
  // De quem é a parte que um pagamento paga: quem pagou (despesa/dívida) ou quem recebe o repasse (receita).
  const partOf = (p: { id: string; settlesId: string | null; payerId: string | null }) =>
    kindOf.get(p.settlesId ?? "") === "income" ? allSplits.find((x) => x.transactionId === p.id)?.participantId ?? null : p.payerId;

  // Confirmação dos membros: dos lançamentos e dos pagamentos ligados a eles (que podem não estar na lista).
  const householdId = rows[0].householdId;
  const inputs: ApprovalInput[] = rows.map((r) => ({ ...r, splits: splits.filter((x) => x.transactionId === r.id) }));
  for (const p of [...linked, ...siblings]) {
    if (!rows.some((r) => r.id === p.id)) inputs.push({ ...p, splits: paySplits.filter((x) => x.transactionId === p.id) });
  }
  const approvals = await approvalStates(householdId, inputs);

  // Por parte (lançamento + pessoa): pagamentos parciais e o que quitou.
  const closing = new Set(allSplits.map((x) => x.paidById).filter((x): x is string => !!x));
  const payments = new Map<string, { id: string; cents: number; pending: boolean; closes: boolean }[]>();
  for (const p of [...linked, ...siblings]) {
    const key = `${p.settlesId}:${partOf(p)}`;
    const list = payments.get(key) ?? [];
    if (!list.some((x) => x.id === p.id)) list.push({ id: p.id, cents: p.amountCents, pending: approvals.has(p.id), closes: closing.has(p.id) });
    payments.set(key, list);
  }

  // Acertos ligados (na lista): o que pagam e quanto era devido.
  const settles = new Map<string, NonNullable<TxRow["settles"]>>();
  for (const r of rows) {
    if (!r.settlesId) continue;
    const o = origs.find((x) => x.id === r.settlesId);
    const who = partOf(r);
    const owed = origSplits.find((x) => x.transactionId === r.settlesId && x.participantId === who)?.amountCents;
    if (!o || owed === undefined) continue;
    const others = (payments.get(`${r.settlesId}:${who}`) ?? []).filter((x) => x.id !== r.id && !x.pending).reduce((a, x) => a + x.cents, 0);
    settles.set(r.id, { txId: o.id, description: o.description, owedCents: owed, otherPaidCents: others, closes: closing.has(r.id) });
  }

  const by = new Map<string, TxRow["splits"]>();
  for (const s of splits) {
    const list = by.get(s.transactionId) ?? [];
    const pays = payments.get(`${s.transactionId}:${s.participantId}`) ?? [];
    // Pagamento que a outra pessoa ainda não confirmou não conta até ela aceitar.
    const closePending = !!s.paidById && approvals.has(s.paidById);
    const partials = pays.filter((x) => !x.closes);
    const partCents = partials.filter((x) => !x.pending).reduce((a, x) => a + x.cents, 0);
    const closeCents = pays.find((x) => x.id === s.paidById)?.cents ?? 0;
    list.push({
      participantId: s.participantId,
      amountCents: s.amountCents,
      paidById: closePending ? null : s.paidById,
      // Quitada: tudo o que foi pago por esta parte (parciais + o último).
      paidCents: s.paidById && !closePending ? closeCents + partCents : null,
      partCents: s.paidById && !closePending ? 0 : partCents,
      partials: partials.map((x) => ({ id: x.id, cents: x.cents, pending: x.pending })),
      pendingPayId: closePending ? s.paidById : partials.find((x) => x.pending)?.id ?? null,
    });
    by.set(s.transactionId, list);
  }
  return rows.map((r) => {
    const approval = approvals.get(r.id) ?? null;
    return { ...r, splits: by.get(r.id) ?? [], settles: settles.get(r.id) ?? null, approval, blocked: !!approval };
  });
}

const txColumns = {
  id: t.id,
  date: t.date,
  description: t.description,
  amountCents: t.amountCents,
  kind: t.kind,
  payerId: t.payerId,
  categoryId: t.categoryId,
  projectId: t.projectId,
  statusId: t.statusId,
  settled: t.settled,
  invoicePaid: t.invoicePaid,
  settlesId: t.settlesId,
  notes: t.notes,
  source: t.source,
  cardId: t.cardId,
  seriesId: t.seriesId,
  seriesKind: t.seriesKind,
  seriesIndex: t.seriesIndex,
  seriesTotal: t.seriesTotal,
  createdBy: t.createdBy,
  householdId: t.householdId,
  createdAt: t.createdAt,
};

export async function listTransactions(viewer: Viewer, f: Filters, limit = 100, offset = 0) {
  await ensureRecurring(viewer.householdId);
  const db = getDb();
  const where = whereFor(viewer, f);
  // Com pessoa escolhida, o total é a parte dela (no Mercado dividido, só a metade).
  const expenseValue = f.person
    ? sql`coalesce((select s."amountCents" from "transaction_splits" s where s."transactionId" = "transactions"."id" and s."participantId" = ${f.person}), 0)`
    : sql`${t.amountCents}`;
  // Quantos ficaram escondidos por serem futuros (para o botão "Mostrar futuros").
  const futureWhere = f.period === "tudo" && !f.future ? and(whereFor(viewer, f, { includeFuture: true }), gt(t.date, endOfThisMonth())) : null;
  const [rows, [{ count, total }], future] = await Promise.all([
    db.select(txColumns).from(t).where(where).orderBy(desc(t.date), desc(t.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(case when ${t.kind} = 'expense' then ${expenseValue} else 0 end), 0)::int` }).from(t).where(where),
    futureWhere ? db.select({ n: sql<number>`count(*)::int` }).from(t).where(futureWhere) : Promise.resolve([{ n: 0 }]),
  ]);
  // Estabelecimentos que se repetem em meses diferentes (últimos 18 meses).
  const history = await db
    .select({ description: t.description, date: t.date })
    .from(t)
    .where(
      and(
        eq(t.householdId, viewer.householdId),
        eq(t.kind, "expense"),
        // Parcelas já são uma série: não contam como compra recorrente.
        or(isNull(t.seriesKind), sql`${t.seriesKind} <> 'installment'`),
        gte(t.date, `${addMonthsKey(todayIn().slice(0, 7), -18)}-01`),
      ),
    );
  const recurring = recurringMerchants(history);
  const withSplits = await attachSplits(rows as BaseRow[]);
  return {
    rows: withSplits.map((r) => ({ ...r, recurring: r.kind === "expense" && r.seriesKind !== "installment" && recurring.has(merchantKey(r.description)) })),
    count,
    total,
    futureCount: future[0].n,
  };
}

/**
 * "A identificar": despesas e receitas até hoje sem categoria, sem quem pagou
 * ou sem quem deveria pagar. Não confundir com o status "Pendente" (pagamento).
 */
function unidentifiedWhere(viewer: Viewer): SQL {
  return txScope(
    viewer,
    inArray(t.kind, ["expense", "income"]),
    lte(t.date, todayIn()),
    or(and(eq(t.kind, "expense"), isNull(t.categoryId)), isNull(t.payerId), sql`not exists (select 1 from "transaction_splits" s where s."transactionId" = "transactions"."id")`),
  );
}

export async function listUnidentified(viewer: Viewer, limit = 300) {
  await ensureRecurring(viewer.householdId);
  const rows = await getDb().select(txColumns).from(t).where(unidentifiedWhere(viewer)).orderBy(desc(t.date), desc(t.createdAt)).limit(limit);
  return attachSplits(rows as BaseRow[]);
}

export async function countUnidentified(viewer: Viewer): Promise<number> {
  const [{ n }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(t).where(unidentifiedWhere(viewer));
  return n;
}

/** Um item de "Para confirmar": o lançamento (numa série, a primeira parcela em aberto) e quantos são. */
export type ApprovalItem = { tx: TxRow; count: number };

/**
 * "Para confirmar": o que outras pessoas colocaram no seu nome e você ainda não aceitou (ou recusou),
 * e o que você lançou e está esperando alguém. Parcelas e meses de uma série aparecem uma vez só.
 */
export const getApprovalInbox = cache(async (viewer: Viewer) => {
  const me = viewer.participantId;
  const empty = { toMe: [] as ApprovalItem[], refusedByMe: [] as ApprovalItem[], fromMe: [] as ApprovalItem[] };
  if (!me) return empty;
  const ctx = await approvalContext(viewer.householdId);
  const rows = await getDb()
    .select(txColumns)
    .from(t)
    .where(
      and(
        eq(t.householdId, viewer.householdId),
        gte(t.createdAt, ctx.from),
        or(
          eq(t.createdBy, viewer.userId),
          eq(t.payerId, me),
          sql`exists (select 1 from "transaction_splits" s where s."transactionId" = ${t.id} and s."participantId" = ${me})`,
        ),
      ),
    )
    .orderBy(asc(t.date), asc(t.createdAt));
  const full = (await attachSplits(rows as BaseRow[])).filter((r) => r.approval);
  const group = (list: TxRow[]) => {
    const by = new Map<string, ApprovalItem>();
    for (const r of list) {
      const k = approvalKey(r);
      const cur = by.get(k);
      if (cur) cur.count++;
      else by.set(k, { tx: r, count: 1 });
    }
    return [...by.values()];
  };
  return {
    toMe: group(full.filter((r) => r.approval!.waiting.includes(me))),
    refusedByMe: group(full.filter((r) => r.approval!.refused.some((x) => x.id === me))),
    fromMe: group(full.filter((r) => r.createdBy === viewer.userId)),
  };
});

/**
 * Primeiro mês em que a família pode ver no painel: o mês em que começou a usar o app.
 * (Quando houver assinatura, vira o início da assinatura.)
 */
export const householdStartMonth = cache(async (householdId: string) => {
  const [h] = await getDb().select({ createdAt: schema.households.createdAt }).from(schema.households).where(eq(schema.households.id, householdId));
  return h ? todayIn("America/Sao_Paulo", h.createdAt).slice(0, 7) : todayIn().slice(0, 7);
});

/**
 * Até onde o usuário pode navegar nos meses: do primeiro mês de uso até o último mês que tem algo
 * lançado (parcelas, contas, compras com data futura; no cartão, pelo mês da fatura). Uma conta
 * "todo mês" sem fim dá 12 meses à frente. Nunca antes da fatura em aberto.
 */
export const navigableMonths = cache(async (householdId: string, current: string) => {
  const db = getDb();
  const [[row], [rec], started] = await Promise.all([
    db.select({ last: sql<string | null>`to_char(max(${competenceSql}), 'YYYY-MM')` }).from(t).where(and(eq(t.householdId, householdId), isNull(t.settlesId))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.recurringSeries)
      .where(and(eq(schema.recurringSeries.householdId, householdId), eq(schema.recurringSeries.active, true))),
    householdStartMonth(householdId),
  ]);
  const candidates = [current, row?.last ?? current, rec.n > 0 ? addMonthsKey(todayIn().slice(0, 7), 12) : current];
  return { first: started < current ? started : current, last: candidates.sort().at(-1)! };
});

/** Um lançamento, se esta pessoa puder vê-lo. */
export async function getTransaction(viewer: Viewer, id: string): Promise<TxRow | null> {
  const db = getDb();
  const rows = await db.select(txColumns).from(t).where(txScope(viewer, eq(t.id, id))).limit(1);
  const [row] = await attachSplits(rows as BaseRow[]);
  return row ?? null;
}

/** Parcelas de uma compra parcelada (para mudar o parcelamento depois de criado). */
export async function getSeriesItems(viewer: Viewer, seriesId: string) {
  return getDb()
    .select({ id: t.id, index: sql<number>`coalesce(${t.seriesIndex}, 0)`, date: t.date, amountCents: t.amountCents, source: t.source })
    .from(t)
    .where(txScope(viewer, eq(t.seriesId, seriesId)))
    .orderBy(asc(t.seriesIndex));
}

/**
 * Meses futuros: o que se repete todo mês sem data para acabar só é criado quando o mês chega.
 * Para ver os próximos meses, cada recorrência vira uma "previsão" (não gravada) em cada mês do período.
 */
/** Fechamento e vencimento de cada cartão da família (para saber em que mês uma compra no cartão é paga). */
export async function closingDays(householdId: string) {
  const rows = await getDb()
    .select({ id: schema.creditCards.id, closingDay: schema.creditCards.closingDay, dueDay: schema.creditCards.dueDay })
    .from(schema.creditCards)
    .where(eq(schema.creditCards.householdId, householdId));
  return new Map(rows.map((r) => [r.id, { closingDay: r.closingDay, dueDay: r.dueDay }]));
}

/** Mês em que um lançamento é pago: no cartão, o mês do vencimento da fatura; sem cartão, o da data. */
const monthOf = (r: { date: string; cardId: string | null }, cards: Map<string, { closingDay: number; dueDay: number }>) =>
  competenceMonth(r.date, r.cardId ? cards.get(r.cardId) : null);

async function projectedRecurring(viewer: Viewer, f: Filters, from: string, to: string): Promise<TxRow[]> {
  if (to <= endOfThisMonth()) return [];
  const start = from > endOfThisMonth() ? from : addDaysIso(endOfThisMonth(), 1);
  const series = await getRecurring(viewer);
  const out: TxRow[] = [];
  for (const s of series) {
    const splits = (s.splits as { participantId: string; amountCents: number }[]).filter((x) => x.amountCents > 0);
    for (const o of dueOccurrences(s.startDate, s.nextIndex, to)) {
      if (o.date < start) continue;
      out.push({
        id: `previsao-${s.id}-${o.index}`,
        date: o.date,
        description: s.description,
        amountCents: splits.reduce((a, x) => a + x.amountCents, 0) || s.amountCents,
        kind: s.kind as TransactionKind,
        payerId: s.payerId,
        categoryId: s.categoryId,
        projectId: s.projectId,
        statusId: null,
        settled: false,
        invoicePaid: false,
        settlesId: null,
        settles: null,
        notes: s.notes,
        source: "projetado",
        cardId: s.cardId,
        seriesId: s.id,
        seriesKind: "monthly",
        seriesIndex: o.index,
        seriesTotal: null,
        createdBy: s.createdBy,
        householdId: viewer.householdId,
        createdAt: new Date(),
        approval: null,
        blocked: false,
        splits: splits.map((x) => ({ ...x, paidById: null, paidCents: null })),
      });
    }
  }
  return out.filter((r) => matchesFilters(r, f));
}

type Filterable = {
  description: string;
  categoryId: string | null;
  projectId: string | null;
  cardId: string | null;
  payerId: string | null;
  splits: { participantId: string; amountCents: number }[];
};

/**
 * Os mesmos filtros da lista (pessoa e o que mostrar dela, categoria, projeto, cartão, busca), em memória:
 * para o que não está no banco como lançamento (contas fixas e as previsões delas).
 */
export function matchesFilters(r: Filterable, f: Filters): boolean {
  if (f.category === "sem" ? r.categoryId : f.category && r.categoryId !== f.category) return false;
  if (f.project && r.projectId !== f.project) return false;
  if (f.card && r.cardId !== f.card) return false;
  if (f.q && !r.description.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.person) {
    const part = r.splits.some((x) => x.participantId === f.person && x.amountCents > 0);
    if (f.role === "dele" && !part) return false;
    if (f.role === "a-receber" && !(r.payerId === f.person && r.splits.some((x) => x.participantId !== f.person && x.amountCents > 0))) return false;
    if (!f.role && !part && r.payerId !== f.person) return false;
  }
  return true;
}

/** Contas fixas que entram nos filtros escolhidos (escolhendo Fulano, só as que envolvem Fulano). */
export async function getRecurringFor(viewer: Viewer, f: Filters) {
  const series = await getRecurring(viewer);
  return series.filter((s) => matchesFilters({ ...s, splits: s.splits as Filterable["splits"] }, f));
}

/** Tudo o que o painel precisa, calculado a partir das transações filtradas. */
export async function getDashboard(viewer: Viewer, f: Filters) {
  await ensureRecurring(viewer.householdId);
  const db = getDb();
  const saved = await attachSplits(
    (await db.select(txColumns).from(t).where(whereFor(viewer, f, { withPayments: true })).orderBy(desc(t.date), desc(t.createdAt))) as BaseRow[],
  );
  let projected: TxRow[] = [];
  if (f.competence) {
    // Previsões no cartão: a compra pode ser de até 2 meses antes do vencimento da fatura.
    const closing = await closingDays(viewer.householdId);
    projected = (await projectedRecurring(viewer, f, `${addMonthsKey(f.competence, -2)}-01`, endOfMonth(`${f.competence}-01`))).filter((r) => monthOf(r, closing) === f.competence);
  } else if (f.from && f.to) projected = await projectedRecurring(viewer, f, f.from, f.to);
  const rows = [...saved, ...projected].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const today = todayIn();

  // Gastos: só a parte de quem está sendo visto (a pessoa do filtro, ou você). O que você pagou por outras
  // pessoas não é gasto seu: elas te devolvem (fica em "Pagou por outros" e em Dívidas).
  // Sem pessoa nenhuma (conta sem pessoa ligada), conta o valor inteiro.
  const focus = f.person ?? (f.everyone ? null : viewer.participantId) ?? null;
  const share = (r: TxRow) => (focus ? r.splits.find((s) => s.participantId === focus)?.amountCents ?? 0 : r.amountCents);
  const expenses = rows.filter((r) => r.kind === "expense");
  const spent = expenses.reduce((a, r) => a + share(r), 0);
  const familySpent = expenses.reduce((a, r) => a + r.amountCents, 0);
  // Vendo outra pessoa: o que você pagou por ela e o que ela te pagou de volta no mês.
  const me = viewer.participantId;
  const other = focus && me && focus !== me ? focus : null;
  const paidByMeForFocus = other
    ? expenses.filter((r) => r.payerId === me).reduce((a, r) => a + (r.splits.find((s) => s.participantId === other)?.amountCents ?? 0), 0)
    : 0;
  // O que essa pessoa ainda te deve das contas do mês que você pagou.
  const stillOwesMe = other
    ? rows
        .filter((r) => (r.kind === "expense" || r.kind === "loan") && r.payerId === me && !r.settled)
        .reduce((a, r) => a + r.splits.filter((sp) => sp.participantId === other && !sp.paidById).reduce((b, sp) => b + sp.amountCents, 0), 0)
    : 0;
  const repaidToMe = other
    ? rows.filter((r) => r.kind === "transfer" && r.payerId === other && r.splits.some((s) => s.participantId === me)).reduce((a, r) => a + r.amountCents, 0)
    : 0;
  // "Devem a você": das contas do mês que a pessoa pagou (e empréstimos que deu), a parte dos outros que
  // ainda não foi paga, por pessoa. Família inteira: tudo que alguém pagou e outra pessoa ainda deve.
  const owedBy = new Map<string, number>();
  for (const r of rows) {
    if ((r.kind !== "expense" && r.kind !== "loan") || !r.payerId || r.settled || r.settlesId) continue;
    if (focus && r.payerId !== focus) continue;
    for (const sp of r.splits) {
      if (sp.participantId === r.payerId || sp.paidById || sp.amountCents <= 0) continue;
      owedBy.set(sp.participantId, (owedBy.get(sp.participantId) ?? 0) + sp.amountCents);
    }
  }
  const paidForOthers = [...owedBy.values()].reduce((a, v) => a + v, 0);
  const owedToMe = [...owedBy].map(([id, cents]) => ({ id, cents })).sort((a, b) => b.cents - a.cents);
  const income = rows.filter((r) => r.kind === "income").reduce((a, r) => a + share(r), 0);
  const byCategory = new Map<string, number>();
  for (const r of expenses) {
    const key = r.categoryId ?? "sem";
    byCategory.set(key, (byCategory.get(key) ?? 0) + share(r));
  }
  const byPerson = new Map<string, number>();
  for (const r of expenses) for (const s of r.splits) byPerson.set(s.participantId, (byPerson.get(s.participantId) ?? 0) + s.amountCents);

  return {
    spent,
    familySpent,
    paidForOthers,
    /** Quem deve (e quanto) das contas do mês que a pessoa vista pagou. */
    owedToMe,
    paidByMeForFocus,
    repaidToMe,
    stillOwesMe,
    /** De quem são os números (a pessoa do filtro ou você). */
    focus,
    income,
    byCategory: [...byCategory].map(([id, cents]) => ({ id, cents })).filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents),
    byPerson: [...byPerson].map(([id, cents]) => ({ id, cents })).sort((a, b) => b.cents - a.cents),
    // Pagamentos de dívida ficam dentro do lançamento que pagam, não como linha própria.
    recent: rows.filter((r) => !r.settlesId).slice(0, 6),
    count: rows.length,
    /** Mês futuro: o que já está combinado (parcelas, previsões e o que se repete), do primeiro ao último dia. */
    planned: [...rows].filter((r) => r.date > today && r.kind !== "transfer").sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

/**
 * Quem deve para quem considerando todo o histórico (sem os filtros do painel):
 * uma dívida antiga continua valendo até ser acertada.
 * - Quem administra vê a família inteira, com a compensação geral.
 * - Os outros veem só as dívidas entre eles e cada pessoa.
 */
export async function getDebts(viewer: Viewer) {
  await ensureRecurring(viewer.householdId);
  const db = getDb();
  const rows = await attachSplits(
    // Parcelas e meses futuros ainda não viraram dívida.
    (await db.select(txColumns).from(t).where(txScope(viewer, isNotNull(t.payerId), lte(t.date, todayIn())))) as BaseRow[],
  );
  const input = rows;
  if (isAdmin(viewer) || !viewer.participantId) {
    const balances = computeBalances(input);
    return { balances, settlements: suggestSettlements(balances), whole: true };
  }
  const net = pairwiseFor(viewer.participantId, input);
  const mine = [...net.values()].reduce((a, v) => a + v, 0);
  return { balances: new Map([[viewer.participantId, mine]]), settlements: pairwiseSettlements(viewer.participantId, net), whole: false };
}

/** covered: quanto deste lançamento já foi pago por acertos avulsos (sem ligação a um lançamento). */
export type LedgerEntry = { tx: TxRow; effect: number; covered?: number };
/** Histórico: o que já foi pago (Recebi/Paguei com valor, acertos e dívidas cobertas por acerto). */
export type LedgerPaid = {
  key: string;
  tx: TxRow;
  /** Positivo: a pessoa te pagou; negativo: você pagou a ela. */
  cents: number;
  how: "recebi" | "acerto" | "coberta";
  /** Lançamento a apagar para desfazer (o acerto); nulo quando a dívida só foi coberta por um acerto. */
  undoId: string | null;
  /** Recebi/Paguei: quanto era devido (para mostrar lucro ou desconto). */
  owedCents?: number;
  /** Pagamento parcial: quanto ainda falta depois dele. */
  leftCents?: number;
};
export type LedgerPerson = {
  personId: string;
  net: number;
  /** Só o que ainda está em aberto (com o que falta, se um acerto cobriu parte). */
  entries: LedgerEntry[];
  upcoming: number;
  upcomingCount: number;
  upcomingEntries: LedgerEntry[];
  paid: LedgerPaid[];
};

/**
 * Painel num mês à frente: o que cada pessoa vai te dever (ou você a ela) só pelo que é DAQUELE mês,
 * imaginando que até lá todo mundo pagou o que devia dos meses anteriores. É uma estimativa.
 * Conta lançamentos do mês (no cartão, pela fatura que vence nele) e as contas fixas ainda não criadas.
 */
export async function getMonthDebts(viewer: Viewer, month: string) {
  const me = viewer.participantId;
  if (!me) return [] as { id: string; net: number }[];
  const cards = await closingDays(viewer.householdId);
  const { from, to } = monthRange(month);
  // Compras no cartão de até 2 meses antes podem cair na fatura que vence neste mês.
  const since = `${addMonthsKey(month, -2)}-01`;
  const saved = await attachSplits(
    (await getDb().select(txColumns).from(t).where(txScope(viewer, isNotNull(t.payerId), gte(t.date, since), lte(t.date, to)))) as BaseRow[],
  );
  const projected = await projectedRecurring(viewer, parseFilters({}), from, to);
  const net = new Map<string, number>();
  for (const r of [...saved, ...projected]) {
    if (monthOf(r, cards) !== month) continue;
    for (const [other, v] of pairEffects(me, r)) net.set(other, (net.get(other) ?? 0) + v);
  }
  return [...net].filter(([, v]) => v !== 0).map(([id, v]) => ({ id, net: v }));
}

/**
 * Página Dívidas: o extrato entre quem está vendo e cada pessoa (o que cada lançamento
 * em aberto soma ou abate) e, para quem administra, as dívidas entre as outras pessoas.
 */
export async function getDebtLedger(viewer: Viewer, lookups: Lookups) {
  await ensureRecurring(viewer.householdId);
  const db = getDb();
  const rows = await attachSplits(
    (await db.select(txColumns).from(t).where(txScope(viewer, isNotNull(t.payerId))).orderBy(desc(t.date), desc(t.createdAt))) as BaseRow[],
  );
  const withBehavior = rows.map((r) => ({ tx: r, input: r }));
  const me = viewer.participantId;
  const today = todayIn();

  const people = new Map<string, LedgerPerson>();
  if (me) {
    for (const { tx, input } of withBehavior) {
      for (const [other, effect] of pairEffects(me, input)) {
        if (effect === 0) continue;
        const p = people.get(other) ?? { personId: other, net: 0, entries: [], upcoming: 0, upcomingCount: 0, upcomingEntries: [], paid: [] };
        // Parcelas e meses futuros: aparecem como "a vencer", sem entrar no que já é devido.
        if (tx.date > today) {
          p.upcoming += effect;
          p.upcomingCount += 1;
          p.upcomingEntries.push({ tx, effect });
        } else {
          p.net += effect;
          p.entries.push({ tx, effect });
        }
        people.set(other, p);
      }
    }
  }
  if (me) {
    // Pagamentos com "Recebi/Paguei" (acerto ligado ao lançamento): ficam no histórico, com "Desfazer".
    for (const tx of rows) {
      if (tx.kind === "transfer" || tx.settlesId || !tx.payerId || tx.date > today) continue;
      for (const sp of tx.splits) {
        const parts = (sp.partials ?? []).filter((x) => !x.pending);
        if ((!sp.paidById && parts.length === 0) || sp.participantId === tx.payerId) continue;
        const iAmPayer = tx.payerId === me;
        if (!iAmPayer && sp.participantId !== me) continue;
        const other = iAmPayer ? sp.participantId : tx.payerId;
        const sign = (tx.kind === "income" ? -1 : 1) * (iAmPayer ? 1 : -1);
        const p = people.get(other) ?? { personId: other, net: 0, entries: [], upcoming: 0, upcomingCount: 0, upcomingEntries: [], paid: [] };
        // Cada pagamento é uma linha: os parciais ("faltou R$ 60,00") e o que quitou.
        let left = sp.amountCents;
        for (const x of parts) {
          left -= x.cents;
          p.paid.push({ key: `r-${x.id}`, tx, cents: sign * x.cents, how: "recebi", undoId: x.id, owedCents: x.cents + Math.max(0, left), leftCents: Math.max(0, left) });
        }
        if (sp.paidById) {
          const partSum = parts.reduce((a, x) => a + x.cents, 0);
          const last = (sp.paidCents ?? sp.amountCents) - partSum;
          p.paid.push({ key: `r-${tx.id}-${sp.participantId}`, tx, cents: sign * last, how: "recebi", undoId: sp.paidById, owedCents: sp.amountCents - partSum });
        }
        people.set(other, p);
      }
    }
    // Acertos avulsos ("Registrar pagamento"): abatem as dívidas mais antigas da pessoa, e as que ficam
    // cobertas saem do "em aberto" (assim não dá para receber duas vezes a mesma dívida).
    for (const p of people.values()) {
      const debts = p.entries.filter((e) => e.tx.kind !== "transfer").sort((a, b) => (a.tx.date < b.tx.date ? -1 : a.tx.date > b.tx.date ? 1 : 0));
      const transfers = p.entries.filter((e) => e.tx.kind === "transfer");
      let theyPaid = transfers.filter((e) => e.effect < 0).reduce((a, e) => a - e.effect, 0);
      let iPaid = transfers.filter((e) => e.effect > 0).reduce((a, e) => a + e.effect, 0);
      for (const d of debts) {
        const need = Math.abs(d.effect);
        const cover = Math.min(need, d.effect > 0 ? theyPaid : iPaid);
        if (d.effect > 0) theyPaid -= cover;
        else iPaid -= cover;
        d.covered = cover;
      }
      for (const tr of transfers) p.paid.push({ key: `a-${tr.tx.id}`, tx: tr.tx, cents: -tr.effect, how: "acerto", undoId: tr.tx.id });
      for (const d of debts) if (d.covered && d.covered >= Math.abs(d.effect)) p.paid.push({ key: `c-${d.tx.id}`, tx: d.tx, cents: d.effect, how: "coberta", undoId: null });
      // Sobra de acerto (pagou mais do que devia): continua em aberto como crédito, para o saldo bater.
      const leftover = theyPaid + iPaid > 0;
      p.entries = [...debts.filter((d) => (d.covered ?? 0) < Math.abs(d.effect)), ...(leftover ? transfers.filter((t2) => (t2.effect < 0 ? theyPaid : iPaid) > 0) : [])];
      p.paid.sort((a, b) => (a.tx.date < b.tx.date ? 1 : a.tx.date > b.tx.date ? -1 : 0));
    }
  }
  // Dívidas entre as outras pessoas (só quem administra vê a família toda).
  const others: Settlement[] = [];
  if (isAdmin(viewer)) {
    const inputs = withBehavior.filter((x) => x.tx.date <= today).map((x) => x.input);
    const ids = lookups.participants.map((p) => p.id).filter((id) => id !== me);
    for (const a of ids) {
      for (const [b, v] of pairwiseFor(a, inputs)) {
        // Cada par uma vez só, e sem você (o seu já está no extrato acima).
        if (b === me || a > b || v === 0) continue;
        others.push(v > 0 ? { fromId: b, toId: a, amountCents: v } : { fromId: a, toId: b, amountCents: -v });
      }
    }
    others.sort((x, y) => y.amountCents - x.amountCents);
  }
  return {
    people: [...people.values()].filter((p) => p.entries.length > 0 || p.upcomingCount > 0 || p.paid.length > 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    others,
  };
}

/**
 * Os próximos 12 meses (e o atual): quanto de despesa já está em cada um, contando parcelas,
 * o que já foi lançado com data futura e o que se repete todo mês. Com pessoa no filtro, só a parte dela.
 */
export async function getOutlook(viewer: Viewer, f: Filters, months = 12) {
  await ensureRecurring(viewer.householdId);
  const first = todayIn().slice(0, 7);
  const last = addMonthsKey(first, months);
  // No cartão, a compra é paga até 2 meses depois: olha desde 2 meses antes do primeiro mês.
  const range = { ...f, period: "custom" as const, month: null, competence: null, from: `${addMonthsKey(first, -2)}-01`, to: endOfMonth(`${last}-01`), status: null };
  const closing = await closingDays(viewer.householdId);
  const saved = await attachSplits((await getDb().select(txColumns).from(t).where(whereFor(viewer, range))) as BaseRow[]);
  const projected = await projectedRecurring(viewer, range, range.from, range.to);
  // Mesma regra do painel: a parte de quem está sendo visto (a pessoa do filtro, ou você).
  const focus = f.person ?? (f.everyone ? null : viewer.participantId) ?? null;
  const share = (r: TxRow) => (focus ? r.splits.find((s) => s.participantId === focus)?.amountCents ?? 0 : r.amountCents);
  const byMonth = new Map<string, { cents: number; recurringCents: number; count: number }>();
  for (let k = first; k <= last; k = addMonthsKey(k, 1)) byMonth.set(k, { cents: 0, recurringCents: 0, count: 0 });
  for (const r of [...saved, ...projected]) {
    if (r.kind !== "expense") continue;
    const m = byMonth.get(monthOf(r, closing));
    if (!m) continue;
    const v = share(r);
    m.cents += v;
    m.count += 1;
    if (r.seriesKind === "monthly") m.recurringCents += v;
  }
  return [...byMonth].map(([key, v]) => ({ key, ...v }));
}

/** Lançamentos que se repetem todo mês sem data para acabar (ativos). */
export async function getRecurring(viewer: Viewer) {
  const db = getDb();
  const r = schema.recurringSeries;
  return db
    .select()
    .from(r)
    .where(and(eq(r.householdId, viewer.householdId), eq(r.active, true), isAdmin(viewer) ? undefined : eq(r.createdBy, viewer.userId)))
    .orderBy(asc(schema.recurringSeries.description));
}

export async function getMembers(householdId: string) {
  const db = getDb();
  return db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
      participantId: schema.memberships.participantId,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.householdId, householdId))
    .orderBy(asc(schema.memberships.createdAt));
}

export async function getInvites(householdId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.householdId, householdId), isNull(schema.invites.usedAt), gte(schema.invites.expiresAt, new Date())))
    .orderBy(desc(schema.invites.createdAt));
}

/**
 * Ajustes → Projetos: o resumo de cada projeto (o que se gastou, sua parte, quantos lançamentos,
 * de quando a quando, as categorias e os últimos lançamentos). Só o que a pessoa pode ver.
 */
export async function getProjectStats(viewer: Viewer) {
  const rows = await attachSplits(
    (await getDb().select(txColumns).from(t).where(txScope(viewer, isNotNull(t.projectId), isNull(t.settlesId))).orderBy(desc(t.date))) as BaseRow[],
  );
  const me = viewer.participantId;
  const out = new Map<string, { totalCents: number; mineCents: number; count: number; first: string; last: string; byCategory: Map<string | null, number>; recent: TxRow[] }>();
  for (const r of rows) {
    if (r.kind !== "expense") continue;
    const p = out.get(r.projectId!) ?? { totalCents: 0, mineCents: 0, count: 0, first: r.date, last: r.date, byCategory: new Map<string | null, number>(), recent: [] as TxRow[] };
    p.totalCents += r.amountCents;
    p.mineCents += me ? r.splits.find((x) => x.participantId === me)?.amountCents ?? 0 : 0;
    p.count += 1;
    if (r.date < p.first) p.first = r.date;
    if (r.date > p.last) p.last = r.date;
    p.byCategory.set(r.categoryId, (p.byCategory.get(r.categoryId) ?? 0) + r.amountCents);
    if (p.recent.length < 8) p.recent.push(r);
    out.set(r.projectId!, p);
  }
  return new Map(
    [...out].map(([id, p]) => [
      id,
      { ...p, byCategory: [...p.byCategory].map(([categoryId, cents]) => ({ categoryId, cents })).sort((a, b) => b.cents - a.cents) },
    ]),
  );
}

export async function getRules(householdId: string) {
  const db = getDb();
  return db.select().from(schema.categoryRules).where(eq(schema.categoryRules.householdId, householdId)).orderBy(asc(schema.categoryRules.pattern));
}

export async function getPresets(householdId: string) {
  const db = getDb();
  return db.select().from(schema.csvPresets).where(eq(schema.csvPresets.householdId, householdId)).orderBy(asc(schema.csvPresets.name));
}

/** Últimas importações (de quem está vendo; quem administra vê todas), com quantos lançamentos ainda existem. */
export async function getImportBatches(viewer: Viewer) {
  const householdId = viewer.householdId;
  const db = getDb();
  const ib = schema.importBatches;
  const batches = await db
    .select()
    .from(ib)
    .where(and(eq(ib.householdId, householdId), isAdmin(viewer) ? undefined : eq(ib.createdBy, viewer.userId)))
    .orderBy(desc(schema.importBatches.createdAt))
    .limit(10);
  if (batches.length === 0) return [];
  const counts = await db
    .select({ batchId: t.importBatchId, n: sql<number>`count(*)::int` })
    .from(t)
    .where(and(eq(t.householdId, householdId), inArray(t.importBatchId, batches.map((b) => b.id))))
    .groupBy(t.importBatchId);
  const left = new Map(counts.map((c) => [c.batchId, c.n]));
  return batches.map((b) => ({ ...b, remaining: left.get(b.id) ?? 0 }));
}
