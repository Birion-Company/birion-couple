import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, getTableColumns, gt, gte, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL, like as sqlLike } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { cardsFor, seesAll, txScope, txScopeAny, type Viewer } from "./access";
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

/**
 * Listas da família. Com `userId`, quem tem login aparece com o apelido que essa conta deu
 * (o nome cadastrado fica em `realName`).
 */
export const getLookups = cache(async (householdId: string, userId?: string) => {
  const db = getDb();
  // Tudo numa ida só ao banco (as consultas não dependem umas das outras).
  const [participants, categories, projects, statuses, cards, loginRows, lastUsed, nicks] = await Promise.all([
    db.select(participantColumns).from(schema.participants).where(eq(schema.participants.householdId, householdId)).orderBy(asc(schema.participants.sortOrder), asc(schema.participants.createdAt)),
    db.select().from(schema.categories).where(eq(schema.categories.householdId, householdId)).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name)),
    db.select().from(schema.projects).where(eq(schema.projects.householdId, householdId)).orderBy(asc(schema.projects.name)),
    db.select().from(schema.statuses).where(eq(schema.statuses.householdId, householdId)).orderBy(asc(schema.statuses.sortOrder), asc(schema.statuses.createdAt)),
    db.select().from(schema.creditCards).where(eq(schema.creditCards.householdId, householdId)).orderBy(asc(schema.creditCards.createdAt)),
    // Quem tem login: usuário, @usuário e a foto de perfil (se tiver).
    db
      .select({ id: schema.memberships.participantId, userId: schema.memberships.userId, username: schema.users.username, avatarAt: schema.users.avatarUpdatedAt })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.householdId, householdId)),
    // Última vez que cada pessoa apareceu num lançamento: ordena os contatos recentes nas listas.
    lastUsedByPerson(householdId),
    userId
      ? db.select({ id: schema.nicknames.participantId, nickname: schema.nicknames.nickname }).from(schema.nicknames).where(eq(schema.nicknames.userId, userId))
      : Promise.resolve([] as { id: string; nickname: string }[]),
  ]);
  const photoOf = new Map(loginRows.filter((x) => x.avatarAt).map((x) => [x.id, `/api/avatar/${x.userId}?v=${x.avatarAt!.getTime()}`]));
  const logins = new Set(loginRows.map((m) => m.id));
  const nickOf = new Map(nicks.map((n) => [n.id, n.nickname]));
  // Contato de outra conta: só o dono vê o nome. Os outros veem "Contato de Fulano", sem foto, e ele não entra nas listas.
  const pidOfUser = new Map(loginRows.map((m) => [m.userId, m.id]));
  const usernameOf = new Map(loginRows.map((m) => [m.id, m.username]));
  const nameOfPid = new Map(participants.map((x) => [x.id, (logins.has(x.id) && nickOf.get(x.id)) || x.name]));
  // Sem dono (ex.: quem saiu da família ou apagou a conta) é de todos.
  const foreign = (x: { id: string; ownerUserId: string | null }) => !!userId && !logins.has(x.id) && x.ownerUserId !== null && x.ownerUserId !== userId;
  const ownerLabel = (ownerUserId: string | null) => {
    const pid = ownerUserId ? pidOfUser.get(ownerUserId) : null;
    const n = pid ? nameOfPid.get(pid) : null;
    return n ? `Contato de ${n.split(" ")[0]}` : "Contato de outra pessoa";
  };
  type FullPerson = (typeof participants)[number] & {
    foreign: boolean;
    username: string | null;
    realName: string;
    nickname: string | null;
    hasLogin: boolean;
    lastUsed: string | null;
    avatarUrl: string | null;
  };
  return {
    participants: participants.map((x): FullPerson =>
      foreign(x)
        // Contato de outra pessoa: só o que as telas usam para mostrar "Contato de Fulano" (enxuto, porque a lista
        // inteira vai em toda página: numa família grande são centenas de itens).
        ? ({ id: x.id, name: ownerLabel(x.ownerUserId), color: "#94A3B8", archived: true, foreign: true, hasLogin: false } as unknown as FullPerson)
        : {
      ...x,
      foreign: false,
      username: usernameOf.get(x.id) ?? null,
      // Apelido só vale para quem tem login (contato sem login você mesmo renomeia).
      name: (logins.has(x.id) && nickOf.get(x.id)) || x.name,
      realName: x.name,
      nickname: logins.has(x.id) ? (nickOf.get(x.id) ?? null) : null,
      hasLogin: logins.has(x.id),
      lastUsed: lastUsed.get(x.id) ?? null,
      avatarUrl: photoOf.get(x.id) ?? (x.photoUpdatedAt && !logins.has(x.id) ? `/api/avatar/pessoa/${x.id}?v=${x.photoUpdatedAt.getTime()}` : null),
          },
    ),
    categories,
    projects,
    statuses,
    cards,
  };
});

export type Lookups = Awaited<ReturnType<typeof getLookups>>;

/** Listas da família como esta pessoa deve vê-las: cartões só os dela (quem administra vê todos). */
export async function getLookupsFor(viewer: Viewer): Promise<Lookups> {
  const l = await getLookups(viewer.householdId, viewer.userId);
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
  // Receita "a receber" só tem esse status (não conta como paga nem a acertar).
  const notAwaiting = or(sql`"transactions"."kind" <> 'income'`, eq(t.awaitingReceipt, false))!;
  switch (state) {
    case "on-card":
      return and(notTransfer, onCard, eq(t.invoicePaid, false))!;
    case "to-pay":
      return and(notTransfer, offCard, isNull(t.payerId))!;
    case "to-receive":
      return and(eq(t.kind, "income"), eq(t.awaitingReceipt, true))!;
    case "to-settle":
      return and(notTransfer, offCard, isNotNull(t.payerId), eq(t.settled, false), owes, notAwaiting)!;
    case "paid":
      return and(
        or(
          eq(t.kind, "transfer"),
          and(onCard, eq(t.invoicePaid, true)),
          and(offCard, isNotNull(t.payerId), or(eq(t.settled, true), sql`not ${owes}`)),
        ),
        notAwaiting,
      )!;
  }
}

/**
 * Primeiro dia do mês em que o lançamento é pago: sem cartão, o mês da data; no cartão, o mês em que vence
 * a fatura em que ele cai (mesma regra de competenceMonth, em lib/cards.ts).
 */
const competenceSql = sql`coalesce(
  (select date_add(
    date_add(date_sub("transactions"."date", interval (day("transactions"."date") - 1) day),
      interval (case when day("transactions"."date") >= least(c."closingDay", day(last_day("transactions"."date"))) then 1 else 0 end) month),
    interval (case when c."dueDay" > c."closingDay" then 0 else 1 end) month
  ) from "credit_cards" c where c."id" = "transactions"."cardId"),
  date_sub("transactions"."date", interval (day("transactions"."date") - 1) day)
)`;

function whereFor(viewer: Viewer, f: Filters, opts: { includeFuture?: boolean; withPayments?: boolean } = {}): SQL {
  // Pagamento de uma dívida ("Recebi/Paguei") não é um movimento à parte: aparece dentro do lançamento
  // que ele paga (abatendo o valor), não como uma linha nova nas listas. (As contas do painel ainda o usam.)
  const parts: (SQL | undefined)[] = opts.withPayments ? [] : [isNull(t.settlesId)];
  if (f.competence) {
    // No cartão, a compra pode ser de até 2 meses antes do mês em que a fatura vence.
    parts.push(gte(t.date, `${addMonthsKey(f.competence, -2)}-01`), lte(t.date, endOfMonth(`${f.competence}-01`)));
    parts.push(sql`${competenceSql} = cast(${`${f.competence}-01`} as date)`);
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
  if (f.debtsOnly) {
    // Alguém (que não quem pagou) ainda deve a parte: despesa, dívida ou receita dividida, no cartão ou não.
    parts.push(
      sql`"transactions"."kind" <> 'transfer'`,
      isNotNull(t.payerId),
      eq(t.settled, false),
      sql`exists (select 1 from "transaction_splits" s where s."transactionId" = "transactions"."id" and s."participantId" <> "transactions"."payerId" and s."amountCents" > 0 and s."paidById" is null)`,
      or(sql`"transactions"."kind" <> 'income'`, eq(t.awaitingReceipt, false)),
    );
  }
  if (f.card) parts.push(eq(t.cardId, f.card));
  if (f.q) parts.push(or(sqlLike(t.description, `%${f.q}%`), sqlLike(t.notes, `%${f.q}%`)));
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
  /** Receita "a receber": ainda não confirmada como recebida. */
  awaitingReceipt: boolean;
  /** Despesa que não precisa de categoria (não vai para "A identificar"). */
  noCategory: boolean;
  /** Conta em que a receita entrou ou de onde a despesa saiu. */
  accountId: string | null;
  /** Acerto que paga a dívida de outro lançamento. */
  settlesId: string | null;
  /** Para acertos ligados: o lançamento pago e quanto era devido (o resto é o valor a mais). */
  /** owedCents: a parte toda; otherPaidCents: o que já tinha sido pago antes; closes: este pagamento quitou a parte. */
  settles: { txId: string; description: string; owedCents: number; otherPaidCents: number; closes: boolean } | null;
  notes: string | null;
  source: string;
  /** Compra recebida de fora, esperando "Confirmar" em A identificar. */
  needsReview: boolean;
  /** Reaproveitado de importação anterior, mas o histórico varia: confira em A identificar. */
  reuseCheck: boolean;
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
  const linked: { id: string; settlesId: string | null; seriesId: string | null; kind: string; payerId: string | null; amountCents: number; createdBy: string | null; createdAt: Date }[] = [];
  const payCols = { id: t.id, settlesId: t.settlesId, seriesId: t.seriesId, kind: t.kind, payerId: t.payerId, amountCents: t.amountCents, createdBy: t.createdBy, createdAt: t.createdAt };
  // Divisões e pagamentos ligados a estes lançamentos ("Recebi/Paguei"): não dependem um do outro, vão juntos.
  // (Cada ida ao banco custa uma espera; por isso o que é independente roda em paralelo.)
  const origIds = [...new Set(rows.map((r) => r.settlesId).filter((x): x is string => !!x))];
  const origs: { id: string; description: string; kind: string; payerId: string | null }[] = [];
  const origSplits: typeof splits = [];
  const siblings: typeof linked = [];
  const part = (list: string[]) => Array.from({ length: Math.ceil(list.length / 500) }, (_, i) => list.slice(i * 500, i * 500 + 500));
  await Promise.all([
    ...part(ids).map(async (c) => splits.push(...(await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, c))))),
    ...part(ids).map(async (c) => linked.push(...(await db.select(payCols).from(t).where(inArray(t.settlesId, c))))),
    // Lançamentos que estes acertos pagam (quando a lista tem o acerto e não o original).
    ...part(origIds).map(async (c) => {
      const [o, os, sb] = await Promise.all([
        db.select({ id: t.id, description: t.description, kind: t.kind, payerId: t.payerId }).from(t).where(inArray(t.id, c)),
        db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, c)),
        db.select(payCols).from(t).where(inArray(t.settlesId, c)),
      ]);
      origs.push(...o);
      origSplits.push(...os);
      siblings.push(...sb);
    }),
  ]);
  const payIdsAll = [...new Set([...linked, ...siblings].map((x) => x.id))];
  const paySplits: typeof splits = [];
  await Promise.all(part(payIdsAll).map(async (c) => paySplits.push(...(await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, c))))));
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
  awaitingReceipt: t.awaitingReceipt,
  noCategory: t.noCategory,
  accountId: t.accountId,
  settlesId: t.settlesId,
  notes: t.notes,
  source: t.source,
  needsReview: t.needsReview,
  reuseCheck: t.reuseCheck,
  cardId: t.cardId,
  seriesId: t.seriesId,
  seriesKind: t.seriesKind,
  seriesIndex: t.seriesIndex,
  seriesTotal: t.seriesTotal,
  createdBy: t.createdBy,
  householdId: t.householdId,
  createdAt: t.createdAt,
};

export async function listTransactions(viewer: Viewer, f: Filters, limit = 100, offset = 0, opts: { rowsOnly?: boolean } = {}) {
  if (!opts.rowsOnly) await ensureRecurring(viewer.householdId);
  const db = getDb();
  const where = whereFor(viewer, f);

  // Com pessoa escolhida, o total é a parte dela (no Mercado dividido, só a metade).
  const expenseValue = f.person
    ? sql`coalesce((select s."amountCents" from "transaction_splits" s where s."transactionId" = "transactions"."id" and s."participantId" = ${f.person}), 0)`
    : sql`${t.amountCents}`;
  // Quantos ficaram escondidos por serem futuros (para o botão "Mostrar futuros").
  const futureWhere = f.period === "tudo" && !f.future ? and(whereFor(viewer, f, { includeFuture: true }), gt(t.date, endOfThisMonth())) : null;
  // Rolagem (mais itens): só as linhas; não conta tudo de novo.
  const [rows, [{ count, total }], future] = await Promise.all([
    db.select(txColumns).from(t).where(where).orderBy(desc(t.date), desc(t.createdAt), desc(t.id)).limit(limit).offset(offset),
    opts.rowsOnly
      ? Promise.resolve([{ count: 0, total: 0 }])
      : db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(case when ${t.kind} = 'expense' then ${expenseValue} else 0 end), 0)` }).from(t).where(where),
    futureWhere && !opts.rowsOnly ? db.select({ n: sql<number>`count(*)` }).from(t).where(futureWhere) : Promise.resolve([{ n: 0 }]),
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
  return txScopeAny(
    viewer,
    inArray(t.kind, ["expense", "income"]),
    // Compra recebida de fora espera confirmação mesmo com tudo preenchido.
    or(
      eq(t.needsReview, true),
      eq(t.reuseCheck, true),
      and(
        lte(t.date, todayIn()),
        or(and(eq(t.kind, "expense"), isNull(t.categoryId), eq(t.noCategory, false)), isNull(t.payerId), sql`not exists (select 1 from "transaction_splits" s where s."transactionId" = "transactions"."id")`),
      ),
    ),
  );
}

export async function listUnidentified(viewer: Viewer, limit = 300) {
  await ensureRecurring(viewer.householdId);
  const rows = await getDb().select(txColumns).from(t).where(unidentifiedWhere(viewer)).orderBy(desc(t.date), desc(t.createdAt)).limit(limit);
  return attachSplits(rows as BaseRow[]);
}

export async function countUnidentified(viewer: Viewer): Promise<number> {
  const [{ n }] = await getDb().select({ n: sql<number>`count(*)` }).from(t).where(unidentifiedWhere(viewer));
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
  const otherMembers = [...ctx.members].filter((x) => x !== me);
  const rows = await getDb()
    .select(txColumns)
    .from(t)
    .where(
      and(
        eq(t.householdId, viewer.householdId),
        eq(t.needsReview, false),
        gte(t.createdAt, ctx.from),
        // Só o que pode pedir aceite: o que outra pessoa lançou com você, ou o que você lançou com outro membro.
        // Lançamento só com contatos (sem login) nunca pede aceite e fica de fora: é a maior parte do histórico.
        or(
          and(
            or(isNull(t.createdBy), ne(t.createdBy, viewer.userId)),
            or(eq(t.payerId, me), sql`exists (select 1 from "transaction_splits" s where s."transactionId" = ${t.id} and s."participantId" = ${me})`),
          ),
          otherMembers.length
            ? and(
                eq(t.createdBy, viewer.userId),
                or(
                  inArray(t.payerId, otherMembers),
                  sql`exists (select 1 from "transaction_splits" s where s."transactionId" = ${t.id} and s."participantId" in ${otherMembers})`,
                ),
              )
            : undefined,
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
    db.select({ last: sql<string | null>`date_format(max(${competenceSql}), '%Y-%m')` }).from(t).where(and(eq(t.householdId, householdId), isNull(t.settlesId))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.recurringSeries)
      .where(and(eq(schema.recurringSeries.householdId, householdId), eq(schema.recurringSeries.active, true))),
    householdStartMonth(householdId),
  ]);
  const candidates = [current, row?.last ?? current, rec.n > 0 ? addMonthsKey(todayIn().slice(0, 7), 12) : current];
  return { first: started < current ? started : current, last: candidates.sort().at(-1)! };
});

/** Repetição "todo mês" sem fim: se ainda está ativa e desde quando (para o formulário mostrar e deixar parar). */
export async function getRecurringState(householdId: string, seriesId: string | null) {
  if (!seriesId) return null;
  const [r] = await getDb()
    .select({ active: schema.recurringSeries.active, startDate: schema.recurringSeries.startDate })
    .from(schema.recurringSeries)
    .where(and(eq(schema.recurringSeries.id, seriesId), eq(schema.recurringSeries.householdId, householdId)));
  return r ?? null;
}

/**
 * Só o que ainda pode mexer numa dívida (para não ler o histórico inteiro a cada abertura):
 * - acertos avulsos (abatem dívidas antigas pela soma);
 * - lançamentos com alguém além de quem pagou que ainda tem parte sem pagamento que a quitou;
 * - com `historySince`: também os quitados e os pagamentos a partir dessa data (para o histórico "Pago").
 * Fica de fora: o que é só de quem pagou, o "Já acertado" antigo e o que foi quitado antes dessa data.
 */
function debtRelevant(historySince?: string): SQL {
  const others = sql`exists (select 1 from "transaction_splits" s where s."transactionId" = "transactions"."id" and s."participantId" <> "transactions"."payerId" and s."amountCents" > 0`;
  const open = sql`${others} and s."paidById" is null)`;
  return or(
    and(eq(t.kind, "transfer"), isNull(t.settlesId)),
    and(eq(t.settled, false), open),
    // Quitado há pouco: o pagamento pode ainda estar esperando a outra pessoa confirmar (aí não conta).
    sql`exists (select 1 from "transaction_splits" s join "transactions" p on p."id" = s."paidById" where s."transactionId" = "transactions"."id" and p."createdAt" > now() - interval 90 day)`,
    historySince ? and(gte(t.date, historySince), or(isNotNull(t.settlesId), sql`${others})`)) : undefined,
  )!;
}

/** Receitas "a receber" até uma data (as atrasadas primeiro): o painel pergunta "Você recebeu?". */
export async function getAwaitingIncome(viewer: Viewer, until: string) {
  return getDb()
    .select({ id: t.id, date: t.date, description: t.description, amountCents: t.amountCents, seriesIndex: t.seriesIndex, seriesTotal: t.seriesTotal, seriesKind: t.seriesKind })
    .from(t)
    .where(txScope(viewer, eq(t.kind, "income"), eq(t.awaitingReceipt, true), lte(t.date, until)))
    .orderBy(asc(t.date))
    .limit(30);
}

/**
 * Dívidas a seu favor que vencem até uma data (as atrasadas também): entram no "A receber" do painel.
 * Uma linha por pessoa que ainda deve, com o que falta (já descontado o que pagou em parte).
 */
export async function getDebtsToReceive(viewer: Viewer, until: string) {
  const me = viewer.participantId;
  if (!me) return [];
  const rows = await attachSplits(
    (await getDb().select(txColumns).from(t).where(txScope(viewer, eq(t.kind, "loan"), eq(t.payerId, me), isNull(t.settlesId), lte(t.date, until))).orderBy(asc(t.date)).limit(60)) as BaseRow[],
  );
  const items = rows
    .filter((r) => !r.blocked && !r.settled)
    .flatMap((r) =>
      r.splits
        .filter((x) => x.participantId !== me && !x.paidById && x.amountCents - (x.partCents ?? 0) > 0)
        .map((x) => ({
          txId: r.id,
          date: r.date,
          description: r.description,
          personId: x.participantId,
          leftCents: x.amountCents - (x.partCents ?? 0),
          pending: !!x.pendingPayId,
          series: r.seriesTotal ? `${r.seriesIndex}/${r.seriesTotal}` : "",
        })),
    );
  if (items.length === 0) return items;
  // O que a pessoa deve de verdade é o saldo com ela: acertos avulsos e o que você deve a ela abatem.
  // Ex.: emprestou R$ 200, ela te pagou R$ 100 e você deve R$ 80 a ela → aparece só R$ 20 a receber.
  const people = [...new Set(items.map((x) => x.personId))];
  const all = await attachSplits(
    (await getDb().select(txColumns).from(t).where(txScope(viewer, isNotNull(t.payerId), lte(t.date, until), debtRelevant()))) as BaseRow[],
  );
  const net = new Map<string, number>();
  for (const r of all) for (const [other, v] of pairEffects(me, r)) if (people.includes(other)) net.set(other, (net.get(other) ?? 0) + v);
  // Cada dívida, da mais nova para a mais antiga, fica com o que sobra do saldo (as mais antigas são
  // as primeiras abatidas, como em Dívidas).
  const left = new Map(people.map((id) => [id, Math.max(0, net.get(id) ?? 0)]));
  const out: typeof items = [];
  for (const x of [...items].reverse()) {
    const room = left.get(x.personId) ?? 0;
    const cents = Math.min(room, x.leftCents);
    left.set(x.personId, room - cents);
    if (cents > 0) out.unshift({ ...x, leftCents: cents });
  }
  return out;
}

/** Um lançamento, se esta pessoa puder vê-lo. */
export async function getTransaction(viewer: Viewer, id: string): Promise<TxRow | null> {
  const db = getDb();
  const rows = await db.select(txColumns).from(t).where(txScopeAny(viewer, eq(t.id, id))).limit(1);
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
        awaitingReceipt: s.kind === "income",
        noCategory: s.noCategory,
        accountId: null,
        settlesId: null,
        settles: null,
        notes: s.notes,
        source: "projetado",
        needsReview: false,
        reuseCheck: false,
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

/**
 * A pessoa ainda não aceitou (ou recusou) este lançamento que outra pessoa colocou no nome dela:
 * até aceitar, a parte dela não conta como gasto dela.
 */
function notAccepted(r: Pick<TxRow, "approval">, pid: string) {
  return !!r.approval && (r.approval.waiting.includes(pid) || r.approval.refused.some((x) => x.id === pid));
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
  const share = (r: TxRow) => (focus ? (notAccepted(r, focus) ? 0 : r.splits.find((s) => s.participantId === focus)?.amountCents ?? 0) : r.amountCents);
  const expenses = rows.filter((r) => r.kind === "expense");
  // Estorno no cartão (receita no cartão): devolve parte de uma compra, então abate os gastos (não é entrada).
  const refunds = rows.filter((r) => r.kind === "income" && r.cardId);
  const spent = expenses.reduce((a, r) => a + share(r), 0) - refunds.reduce((a, r) => a + share(r), 0);
  const familySpent = expenses.reduce((a, r) => a + r.amountCents, 0) - refunds.reduce((a, r) => a + r.amountCents, 0);
  // Vendo outra pessoa: o que você pagou por ela e o que ela te pagou de volta no mês.
  const me = viewer.participantId;
  const other = focus && me && focus !== me ? focus : null;
  const paidByMeForFocus = other
    ? expenses.filter((r) => r.payerId === me).reduce((a, r) => a + (r.splits.find((s) => s.participantId === other)?.amountCents ?? 0), 0)
    : 0;
  // O que essa pessoa ainda te deve das contas do mês que você pagou.
  // O que falta de uma parte: o valor menos os pagamentos parciais já confirmados (igual à aba Dívidas).
  const leftOf = (sp: TxRow["splits"][number]) => Math.max(0, sp.amountCents - (sp.partCents ?? 0));
  // Esperando confirmação ou recusado ainda não é dívida (igual à aba Dívidas).
  const stillOwesMe = other
    ? rows
        .filter((r) => (r.kind === "expense" || r.kind === "loan") && r.payerId === me && !r.settled && !r.blocked)
        .reduce((a, r) => a + r.splits.filter((sp) => sp.participantId === other && !sp.paidById).reduce((b, sp) => b + leftOf(sp), 0), 0)
    : 0;
  const repaidToMe = other
    ? rows.filter((r) => r.kind === "transfer" && r.payerId === other && r.splits.some((s) => s.participantId === me)).reduce((a, r) => a + r.amountCents, 0)
    : 0;
  // "Devem a você": das contas do mês que a pessoa pagou (e empréstimos que deu), a parte dos outros que
  // ainda não foi paga, por pessoa. Família inteira: tudo que alguém pagou e outra pessoa ainda deve.
  const owedBy = new Map<string, number>();
  for (const r of rows) {
    if ((r.kind !== "expense" && r.kind !== "loan") || !r.payerId || r.settled || r.settlesId || r.blocked) continue;
    if (focus && r.payerId !== focus) continue;
    for (const sp of r.splits) {
      if (sp.participantId === r.payerId || sp.paidById || leftOf(sp) <= 0) continue;
      owedBy.set(sp.participantId, (owedBy.get(sp.participantId) ?? 0) + leftOf(sp));
    }
  }
  const paidForOthers = [...owedBy.values()].reduce((a, v) => a + v, 0);
  // O contrário: o que a pessoa vista ainda deve, das contas do mês que outras pessoas pagaram.
  let iOweMonth = 0;
  if (focus) {
    for (const r of rows) {
      if ((r.kind !== "expense" && r.kind !== "loan") || !r.payerId || r.payerId === focus || r.settled || r.settlesId || r.blocked) continue;
      const sp = r.splits.find((x) => x.participantId === focus);
      if (sp && !sp.paidById) iOweMonth += leftOf(sp);
    }
  }
  const owedToMe = [...owedBy].map(([id, cents]) => ({ id, cents })).sort((a, b) => b.cents - a.cents);
  // Entradas: só o que já foi recebido ("a receber" fica de fora até o "Recebi").
  const income = rows.filter((r) => r.kind === "income" && !r.awaitingReceipt && !r.cardId).reduce((a, r) => a + share(r), 0);
  const byCategory = new Map<string, number>();
  for (const r of expenses) {
    const key = r.categoryId ?? "sem";
    byCategory.set(key, (byCategory.get(key) ?? 0) + share(r));
  }
  for (const r of refunds) {
    const key = r.categoryId ?? "sem";
    byCategory.set(key, (byCategory.get(key) ?? 0) - share(r));
  }
  const byPerson = new Map<string, number>();
  for (const r of expenses) for (const s of r.splits) if (!notAccepted(r, s.participantId)) byPerson.set(s.participantId, (byPerson.get(s.participantId) ?? 0) + s.amountCents);

  return {
    spent,
    familySpent,
    paidForOthers,
    iOweMonth,
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
    (await db.select(txColumns).from(t).where(txScope(viewer, isNotNull(t.payerId), lte(t.date, todayIn()), debtRelevant()))) as BaseRow[],
  );
  const input = rows;
  if (seesAll(viewer) || !viewer.participantId) {
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
  /** Recebi/Paguei: quanto era devido (para mostrar o valor a mais). */
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
  if (!me) return [] as { id: string; net: number; items: DebtItem[] }[];
  const cards = await closingDays(viewer.householdId);
  const { from, to } = monthRange(month);
  // Compras no cartão de até 2 meses antes podem cair na fatura que vence neste mês.
  const since = `${addMonthsKey(month, -2)}-01`;
  const saved = await attachSplits(
    (await getDb().select(txColumns).from(t).where(txScope(viewer, isNotNull(t.payerId), gte(t.date, since), lte(t.date, to)))) as BaseRow[],
  );
  const projected = await projectedRecurring(viewer, parseFilters({}), from, to);
  const net = new Map<string, number>();
  // De quê: cada lançamento que soma ou abate a dívida com a pessoa (para a exportação).
  const items = new Map<string, DebtItem[]>();
  for (const r of [...saved, ...projected]) {
    if (monthOf(r, cards) !== month) continue;
    for (const [other, v] of pairEffects(me, r)) {
      if (v === 0) continue;
      net.set(other, (net.get(other) ?? 0) + v);
      items.set(other, [...(items.get(other) ?? []), { description: r.description, date: r.date, cents: v, projected: r.source === "projetado" }]);
    }
  }
  return [...net].filter(([, v]) => v !== 0).map(([id, v]) => ({ id, net: v, items: items.get(id) ?? [] }));
}

/** Um lançamento que forma uma dívida: positivo = a pessoa te deve; negativo = você deve a ela. */
export type DebtItem = { description: string; date: string; cents: number; projected?: boolean };

/** Contas "todo mês" previstas para um mês à frente (ainda não lançadas), como no painel. */
export async function projectedForMonth(viewer: Viewer, month: string) {
  const closing = await closingDays(viewer.householdId);
  return (await projectedRecurring(viewer, parseFilters({}), `${addMonthsKey(month, -2)}-01`, endOfMonth(`${month}-01`))).filter((r) => monthOf(r, closing) === month);
}

/**
 * Página Dívidas: o extrato entre quem está vendo e cada pessoa (o que cada lançamento
 * em aberto soma ou abate) e, para quem administra, as dívidas entre as outras pessoas.
 */
export async function getDebtLedger(viewer: Viewer, lookups: Lookups) {
  await ensureRecurring(viewer.householdId);
  const db = getDb();
  const rows = await attachSplits(
    (
      await db
        .select(txColumns)
        .from(t)
        // O histórico "Pago" mostra os últimos 6 meses; o que ainda está em aberto vem sempre, de qualquer data.
        .where(txScope(viewer, isNotNull(t.payerId), debtRelevant(`${addMonthsKey(todayIn().slice(0, 7), -6)}-01`)))
        .orderBy(desc(t.date), desc(t.createdAt))
    ) as BaseRow[],
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
  // Dívidas entre as outras pessoas (só a auditoria vê a família toda).
  const others: Settlement[] = [];
  if (seesAll(viewer)) {
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
  const share = (r: TxRow) => (focus ? (notAccepted(r, focus) ? 0 : r.splits.find((s) => s.participantId === focus)?.amountCents ?? 0) : r.amountCents);
  const byMonth = new Map<string, { cents: number; recurringCents: number; count: number }>();
  for (let k = first; k <= last; k = addMonthsKey(k, 1)) byMonth.set(k, { cents: 0, recurringCents: 0, count: 0 });
  for (const r of [...saved, ...projected]) {
    const refund = r.kind === "income" && !!r.cardId;
    if (r.kind !== "expense" && !refund) continue;
    const m = byMonth.get(monthOf(r, closing));
    if (!m) continue;
    const v = refund ? -share(r) : share(r);
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
    .where(and(eq(r.householdId, viewer.householdId), eq(r.active, true), seesAll(viewer) ? undefined : eq(r.createdBy, viewer.userId)))
    .orderBy(asc(schema.recurringSeries.description));
}

export async function getMembers(householdId: string) {
  const db = getDb();
  return db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      username: schema.users.username,
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
    .where(and(eq(schema.invites.householdId, householdId), isNull(schema.invites.usedAt), gte(schema.invites.expiresAt, new Date()), sql`${schema.invites.createdAt} > now() - interval 1 day`))
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

/** Lançamentos de um projeto (o que a pessoa pode ver), do mais novo para o mais velho. */
export async function getProjectTransactions(viewer: Viewer, projectId: string) {
  return attachSplits((await getDb().select(txColumns).from(t).where(txScope(viewer, eq(t.projectId, projectId), isNull(t.settlesId))).orderBy(desc(t.date))) as BaseRow[]);
}

/** Para "colocar no projeto": despesas sem projeto dos últimos 6 meses (e as já lançadas para frente). */
export async function getProjectCandidates(viewer: Viewer) {
  const since = addDaysIso(todayIn(), -183);
  return getDb()
    .select({ id: t.id, date: t.date, description: t.description, amountCents: t.amountCents, categoryId: t.categoryId, cardId: t.cardId, seriesIndex: t.seriesIndex, seriesTotal: t.seriesTotal })
    .from(t)
    .where(txScope(viewer, isNull(t.projectId), isNull(t.settlesId), eq(t.kind, "expense"), gte(t.date, since)))
    .orderBy(desc(t.date))
    .limit(400);
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
    .where(and(eq(ib.householdId, householdId), seesAll(viewer) ? undefined : eq(ib.createdBy, viewer.userId)))
    .orderBy(desc(schema.importBatches.createdAt))
    .limit(10);
  if (batches.length === 0) return [];
  const counts = await db
    .select({ batchId: t.importBatchId, n: sql<number>`count(*)` })
    .from(t)
    .where(and(eq(t.householdId, householdId), inArray(t.importBatchId, batches.map((b) => b.id))))
    .groupBy(t.importBatchId);
  const left = new Map(counts.map((c) => [c.batchId, c.n]));
  return batches.map((b) => ({ ...b, remaining: left.get(b.id) ?? 0 }));
}


/**
 * Saldo inicial de um mês: o que sobrou (entradas recebidas menos a sua parte dos gastos) em todos os meses
 * antes dele, desde o primeiro mês de uso. Cartão conta no mês da fatura, como no resto do painel.
 */
export async function monthCarry(viewer: Viewer, month: string): Promise<number> {
  const me = viewer.participantId;
  if (!me) return 0;
  const [row] = await getDb()
    .select({
      spent: sql<number>`coalesce(sum(case when ${t.kind} = 'expense' then s."amountCents" when ${t.kind} = 'income' and ${t.cardId} is not null then -s."amountCents" else 0 end), 0)`,
      income: sql<number>`coalesce(sum(case when ${t.kind} = 'income' and ${t.cardId} is null and ${t.awaitingReceipt} = false then s."amountCents" else 0 end), 0)`,
    })
    .from(t)
    .innerJoin(sql`"transaction_splits" s`, sql`s."transactionId" = ${t.id} and s."participantId" = ${me}`)
    .where(txScope(viewer, isNull(t.settlesId), sql`${competenceSql} < cast(${`${month}-01`} as date)`, sql`${t.kind} in ('expense', 'income')`));
  return Number(row?.income ?? 0) - Number(row?.spent ?? 0);
}

/**
 * Painel do casal: o mês das duas pessoas juntas. Quanto cada uma consumiu (a sua parte nos gastos), quanto pagou
 * de fato, o que foi dividido entre as duas e as maiores categorias.
 */
export async function getCoupleMonth(viewer: Viewer, month: string) {
  const me = viewer.participantId;
  if (!me) return null;
  const db = getDb();
  const members = await db
    .select({ pid: schema.memberships.participantId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, viewer.householdId), isNotNull(schema.memberships.participantId)));
  const partnerId = members.map((m) => m.pid!).find((p) => p !== me) ?? null;
  await ensureRecurring(viewer.householdId);
  const f = { ...parseFilters({}, "mes"), period: "mes" as const, month: null, competence: month, ...monthRange(month), everyone: true };
  const rows = await attachSplits(
    // O painel do casal soma as duas pessoas: lê os lançamentos dos dois, mas só entram as partes do par e a lista de gastos juntos.
    (await db.select(txColumns).from(t).where(whereFor({ ...viewer, all: true }, f)).orderBy(desc(t.date), desc(t.createdAt))) as BaseRow[],
  );
  const pair = [me, partnerId].filter(Boolean) as string[];
  // Acerto entre as duas pessoas: só o que um pagou e coube ao outro (mesmo cálculo das Dívidas). Pagar por um
  // terceiro (mãe, amigo) não cria dívida da outra pessoa do casal. Positivo = o par te deve.
  const net = partnerId ? (pairwiseFor(me, rows.filter((r) => !r.blocked)).get(partnerId) ?? 0) : 0;
  const expenses = rows.filter((r) => r.kind === "expense" && !r.blocked);
  const refunds = rows.filter((r) => r.kind === "income" && r.cardId);
  const share = (r: TxRow, id: string) => r.splits.find((s) => s.participantId === id)?.amountCents ?? 0;
  const per = new Map<string, { consumed: number; paid: number }>(pair.map((id) => [id, { consumed: 0, paid: 0 }]));
  const byCategory = new Map<string, number>();
  let together = 0;
  const shared: TxRow[] = [];
  for (const r of expenses) {
    let any = 0;
    for (const id of pair) {
      const c = share(r, id);
      per.get(id)!.consumed += c;
      any += c;
      if (c > 0) byCategory.set(r.categoryId ?? "sem", (byCategory.get(r.categoryId ?? "sem") ?? 0) + c);
    }
    for (const id of pair) if (r.payerId === id) per.get(id)!.paid += r.amountCents;
    if (any > 0 && pair.every((id) => share(r, id) > 0)) {
      together += any;
      shared.push(r);
    }
  }
  for (const r of refunds) for (const id of pair) per.get(id)!.consumed -= share(r, id);
  const totalConsumed = [...per.values()].reduce((a, v) => a + v.consumed, 0);
  return {
    me,
    partnerId,
    per: Object.fromEntries(per),
    net,
    totalConsumed,
    together,
    sharedCount: shared.length,
    recentShared: shared.slice(0, 6),
    byCategory: [...byCategory].map(([id, cents]) => ({ id, cents })).sort((a, b) => b.cents - a.cents).slice(0, 6),
  };
}
