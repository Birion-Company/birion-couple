import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeBalances, suggestSettlements, type StatusBehavior, type TransactionKind } from "./balances";
import type { Filters } from "./filters";

const t = schema.transactions;

export async function getLookups(householdId: string) {
  const db = getDb();
  const [participants, categories, projects, statuses, cards] = await Promise.all([
    db.select().from(schema.participants).where(eq(schema.participants.householdId, householdId)).orderBy(asc(schema.participants.sortOrder), asc(schema.participants.createdAt)),
    db.select().from(schema.categories).where(eq(schema.categories.householdId, householdId)).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name)),
    db.select().from(schema.projects).where(eq(schema.projects.householdId, householdId)).orderBy(asc(schema.projects.name)),
    db.select().from(schema.statuses).where(eq(schema.statuses.householdId, householdId)).orderBy(asc(schema.statuses.sortOrder), asc(schema.statuses.createdAt)),
    db.select().from(schema.creditCards).where(eq(schema.creditCards.householdId, householdId)).orderBy(asc(schema.creditCards.createdAt)),
  ]);
  return { participants, categories, projects, statuses, cards };
}

export type Lookups = Awaited<ReturnType<typeof getLookups>>;

function whereFor(householdId: string, f: Filters): SQL {
  const parts: (SQL | undefined)[] = [eq(t.householdId, householdId)];
  if (f.from) parts.push(gte(t.date, f.from));
  if (f.to) parts.push(lte(t.date, f.to));
  if (f.category === "sem") parts.push(isNull(t.categoryId));
  else if (f.category) parts.push(eq(t.categoryId, f.category));
  if (f.project) parts.push(eq(t.projectId, f.project));
  if (f.status) parts.push(eq(t.statusId, f.status));
  if (f.card) parts.push(eq(t.cardId, f.card));
  if (f.q) parts.push(or(ilike(t.description, `%${f.q}%`), ilike(t.notes, `%${f.q}%`)));
  if (f.person) {
    parts.push(
      or(
        eq(t.payerId, f.person),
        sql`exists (select 1 from ${schema.transactionSplits} s where s."transactionId" = ${t.id} and s."participantId" = ${f.person})`,
      ),
    );
  }
  return and(...parts)!;
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
  notes: string | null;
  source: string;
  cardId: string | null;
  seriesId: string | null;
  seriesKind: string | null;
  seriesIndex: number | null;
  seriesTotal: number | null;
  splits: { participantId: string; amountCents: number }[];
};

async function attachSplits(rows: Omit<TxRow, "splits">[]): Promise<TxRow[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const splits: { transactionId: string; participantId: string; amountCents: number }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    splits.push(
      ...(await db
        .select()
        .from(schema.transactionSplits)
        .where(inArray(schema.transactionSplits.transactionId, ids.slice(i, i + 500)))),
    );
  }
  const by = new Map<string, TxRow["splits"]>();
  for (const s of splits) {
    const list = by.get(s.transactionId) ?? [];
    list.push({ participantId: s.participantId, amountCents: s.amountCents });
    by.set(s.transactionId, list);
  }
  return rows.map((r) => ({ ...r, splits: by.get(r.id) ?? [] }));
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
  notes: t.notes,
  source: t.source,
  cardId: t.cardId,
  seriesId: t.seriesId,
  seriesKind: t.seriesKind,
  seriesIndex: t.seriesIndex,
  seriesTotal: t.seriesTotal,
};

export async function listTransactions(householdId: string, f: Filters, limit = 100, offset = 0) {
  const db = getDb();
  const where = whereFor(householdId, f);
  const [rows, [{ count, total }]] = await Promise.all([
    db.select(txColumns).from(t).where(where).orderBy(desc(t.date), desc(t.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(case when ${t.kind} = 'expense' then ${t.amountCents} else 0 end), 0)::int` }).from(t).where(where),
  ]);
  return { rows: await attachSplits(rows as Omit<TxRow, "splits">[]), count, total };
}

export async function getTransaction(householdId: string, id: string): Promise<TxRow | null> {
  const db = getDb();
  const rows = await db.select(txColumns).from(t).where(and(eq(t.householdId, householdId), eq(t.id, id))).limit(1);
  const [row] = await attachSplits(rows as Omit<TxRow, "splits">[]);
  return row ?? null;
}

/** Tudo o que o painel precisa, calculado a partir das transações filtradas. */
export async function getDashboard(householdId: string, f: Filters, lookups: Lookups) {
  const db = getDb();
  const rows = await attachSplits(
    (await db.select(txColumns).from(t).where(whereFor(householdId, f)).orderBy(desc(t.date), desc(t.createdAt))) as Omit<TxRow, "splits">[],
  );
  const behaviorOf = new Map(lookups.statuses.map((s) => [s.id, s.behavior as StatusBehavior]));
  const behavior = (r: TxRow) => (r.statusId ? behaviorOf.get(r.statusId) ?? null : null);

  const balances = computeBalances(rows.map((r) => ({ ...r, behavior: behavior(r) })));
  const settlements = suggestSettlements(balances);

  const pending = rows.filter((r) => behavior(r) === "pending");
  const pendingTotal = pending.reduce((a, r) => a + r.amountCents, 0);

  // Gastos: despesas do período (acertos entre pessoas não são gasto).
  // Com filtro de pessoa, conta só a parte dela.
  const share = (r: TxRow) =>
    f.person ? r.splits.find((s) => s.participantId === f.person)?.amountCents ?? 0 : r.amountCents;
  const expenses = rows.filter((r) => r.kind === "expense");
  const spent = expenses.reduce((a, r) => a + share(r), 0);
  const income = rows.filter((r) => r.kind === "income").reduce((a, r) => a + share(r), 0);
  const byCategory = new Map<string, number>();
  for (const r of expenses) {
    const key = r.categoryId ?? "sem";
    byCategory.set(key, (byCategory.get(key) ?? 0) + share(r));
  }
  const byPerson = new Map<string, number>();
  for (const r of expenses) for (const s of r.splits) byPerson.set(s.participantId, (byPerson.get(s.participantId) ?? 0) + s.amountCents);

  return {
    balances,
    settlements,
    pending: pending.slice(0, 6),
    pendingCount: pending.length,
    pendingTotal,
    spent,
    income,
    byCategory: [...byCategory].map(([id, cents]) => ({ id, cents })).filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents),
    byPerson: [...byPerson].map(([id, cents]) => ({ id, cents })).sort((a, b) => b.cents - a.cents),
    recent: rows.slice(0, 6),
    count: rows.length,
  };
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

export async function getRules(householdId: string) {
  const db = getDb();
  return db.select().from(schema.categoryRules).where(eq(schema.categoryRules.householdId, householdId)).orderBy(asc(schema.categoryRules.pattern));
}

export async function getPresets(householdId: string) {
  const db = getDb();
  return db.select().from(schema.csvPresets).where(eq(schema.csvPresets.householdId, householdId)).orderBy(asc(schema.csvPresets.name));
}

export async function getImportBatches(householdId: string) {
  const db = getDb();
  return db.select().from(schema.importBatches).where(eq(schema.importBatches.householdId, householdId)).orderBy(desc(schema.importBatches.createdAt)).limit(10);
}
