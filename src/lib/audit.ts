import "server-only";
import { and, count, desc, eq, gte, isNull, max, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getActivityFeed } from "./activity";
import { getLookups } from "./queries";

/**
 * Consultas da área de auditoria (conta do BIRION que só lê). Nada aqui altera dados.
 * Mostra quem se cadastrou, as famílias e o que cada pessoa fez dentro da própria família.
 */
const u = schema.users;
const h = schema.households;
const m = schema.memberships;
const t = schema.transactions;
const a = schema.activities;
const p = schema.participants;

export async function auditOverview() {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const monthAgo = new Date(Date.now() - 30 * 86400000);
  const [[users], [houses], [txs], [acts], [newUsers]] = await Promise.all([
    db.select({ n: count() }).from(u).where(eq(u.isAuditor, false)),
    db.select({ n: count() }).from(h),
    db.select({ n: count() }).from(t).where(isNull(t.settlesId)),
    db.select({ n: count() }).from(a).where(gte(a.createdAt, weekAgo)),
    db.select({ n: count() }).from(u).where(and(eq(u.isAuditor, false), gte(u.createdAt, monthAgo))),
  ]);
  return { users: users.n, households: houses.n, transactions: txs.n, activityWeek: acts.n, newUsersMonth: newUsers.n };
}

/** Todas as pessoas com login: quando se cadastraram, em qual família, papel e o último movimento. */
export async function auditUsers() {
  const db = getDb();
  const last = db
    .select({ uid: a.actorUserId, last: max(a.createdAt).as("last"), n: count().as("n") })
    .from(a)
    .groupBy(a.actorUserId)
    .as("last");
  return db
    .select({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      householdId: h.id,
      household: h.name,
      role: m.role,
      lastActivity: last.last,
      actions: last.n,
    })
    .from(u)
    .leftJoin(m, eq(m.userId, u.id))
    .leftJoin(h, eq(h.id, m.householdId))
    .leftJoin(last, eq(last.uid, u.id))
    .where(eq(u.isAuditor, false))
    .orderBy(desc(u.createdAt));
}

/** Famílias: quando começaram, quantas pessoas, contatos, lançamentos e a última atividade. */
export async function auditHouseholds() {
  const db = getDb();
  const rows = await db
    .select({
      id: h.id,
      name: h.name,
      createdAt: h.createdAt,
      members: sql<number>`(select count(*)::int from ${m} where ${m.householdId} = ${h.id})`,
      contacts: sql<number>`(select count(*)::int from ${p} where ${p.householdId} = ${h.id} and ${p.id} not in (select ${m.participantId} from ${m} where ${m.householdId} = ${h.id} and ${m.participantId} is not null))`,
      transactions: sql<number>`(select count(*)::int from ${t} where ${t.householdId} = ${h.id} and ${t.settlesId} is null)`,
      lastActivity: sql<Date | null>`(select max(${a.createdAt}) from ${a} where ${a.householdId} = ${h.id})`,
    })
    .from(h)
    .orderBy(desc(h.createdAt));
  return rows.map((r) => ({ ...r, lastActivity: r.lastActivity ? new Date(r.lastActivity) : null }));
}

/** Uma família por dentro: membros, números e o histórico do que cada um fez (frases prontas). */
export async function auditHousehold(householdId: string, auditorId: string) {
  const db = getDb();
  const [house] = await db.select().from(h).where(eq(h.id, householdId)).limit(1);
  if (!house) return null;
  const [members, lookups, [cards], [txs]] = await Promise.all([
    db
      .select({ id: u.id, name: u.name, email: u.email, role: m.role, joinedAt: m.createdAt, createdAt: u.createdAt })
      .from(m)
      .innerJoin(u, eq(u.id, m.userId))
      .where(eq(m.householdId, householdId))
      .orderBy(m.createdAt),
    getLookups(householdId),
    db.select({ n: count() }).from(schema.creditCards).where(eq(schema.creditCards.householdId, householdId)),
    db.select({ n: count() }).from(t).where(and(eq(t.householdId, householdId), isNull(t.settlesId))),
  ]);
  // Lida como "administrador sem pessoa": vê tudo da família, sem "você" nas frases.
  const feed = await getActivityFeed({ householdId, userId: auditorId, participantId: null, role: "owner" }, lookups, house.currency, { audit: true, limit: 300 });
  return {
    house,
    members,
    contacts: lookups.participants.filter((x) => !x.hasLogin),
    categories: lookups.categories.length,
    cards: cards.n,
    transactions: txs.n,
    feed,
  };
}
