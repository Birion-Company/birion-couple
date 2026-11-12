import "server-only";
import { and, count, desc, eq, gte, ilike, inArray, isNull, max, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { feedPage } from "./activity";
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

export const AUDIT_PAGE = 20;

/** Termo de busca seguro para ILIKE (sem curingas do usuário). */
const like = (q: string) => `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Pessoas com login, com busca (nome, e-mail, @usuário ou nome da família) e páginas de AUDIT_PAGE.
 * Ordem: cadastro mais recente, ou última ação.
 */
export async function auditUsers({ q = "", page = 1, sort = "recent" }: { q?: string; page?: number; sort?: string } = {}) {
  const db = getDb();
  const last = db
    .select({ uid: a.actorUserId, last: max(a.createdAt).as("last"), n: count().as("n") })
    .from(a)
    .groupBy(a.actorUserId)
    .as("last");
  const where = and(
    eq(u.isAuditor, false),
    q.trim() ? or(ilike(u.name, like(q)), ilike(u.email, like(q)), ilike(u.username, like(q)), ilike(h.name, like(q))) : undefined,
  );
  const base = db.select({ n: count() }).from(u).leftJoin(m, eq(m.userId, u.id)).leftJoin(h, eq(h.id, m.householdId)).where(where);
  const [[{ n: total }], rows] = await Promise.all([
    base,
    db
      .select({
        id: u.id,
        name: u.name,
        username: u.username,
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
      .where(where)
      .orderBy(sort === "activity" ? sql`${last.last} desc nulls last` : desc(u.createdAt))
      .limit(AUDIT_PAGE)
      .offset((Math.max(1, page) - 1) * AUDIT_PAGE),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / AUDIT_PAGE)) };
}

/**
 * Famílias, com busca (nome da família ou de quem tem login nela) e páginas. Cada uma vem com as
 * pessoas com login (nome, @usuário, papel).
 */
export async function auditHouseholds({ q = "", page = 1, sort = "recent" }: { q?: string; page?: number; sort?: string } = {}) {
  const db = getDb();
  const lastAct = sql<Date | null>`(select max(${a.createdAt}) from ${a} where ${a.householdId} = ${h.id})`;
  const where = q.trim()
    ? or(
        ilike(h.name, like(q)),
        sql`exists (select 1 from ${m} join ${u} on ${u.id} = ${m.userId} where ${m.householdId} = ${h.id} and (${u.name} ilike ${like(q)} or ${u.email} ilike ${like(q)} or ${u.username} ilike ${like(q)}))`,
      )
    : undefined;
  const [[{ n: total }], rows] = await Promise.all([
    db.select({ n: count() }).from(h).where(where),
    db
      .select({
        id: h.id,
        name: h.name,
        createdAt: h.createdAt,
        members: sql<number>`(select count(*)::int from ${m} where ${m.householdId} = ${h.id})`,
        contacts: sql<number>`(select count(*)::int from ${p} where ${p.householdId} = ${h.id} and ${p.id} not in (select ${m.participantId} from ${m} where ${m.householdId} = ${h.id} and ${m.participantId} is not null))`,
        transactions: sql<number>`(select count(*)::int from ${t} where ${t.householdId} = ${h.id} and ${t.settlesId} is null)`,
        lastActivity: lastAct,
      })
      .from(h)
      .where(where)
      .orderBy(sort === "activity" ? sql`${lastAct} desc nulls last` : desc(h.createdAt))
      .limit(AUDIT_PAGE)
      .offset((Math.max(1, page) - 1) * AUDIT_PAGE),
  ]);
  const ids = rows.map((r) => r.id);
  const people = ids.length
    ? await db
        .select({ hid: m.householdId, name: u.name, username: u.username, role: m.role })
        .from(m)
        .innerJoin(u, eq(u.id, m.userId))
        .where(inArray(m.householdId, ids))
        .orderBy(m.createdAt)
    : [];
  return {
    rows: rows.map((r) => ({ ...r, lastActivity: r.lastActivity ? new Date(r.lastActivity) : null, people: people.filter((x) => x.hid === r.id) })),
    total,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE)),
  };
}

/** Uma família por dentro: membros, números e o histórico do que cada um fez (frases prontas). */
export async function auditHousehold(householdId: string, auditorId: string) {
  const db = getDb();
  const [house] = await db.select().from(h).where(eq(h.id, householdId)).limit(1);
  if (!house) return null;
  const [members, lookups, [cards], [txs]] = await Promise.all([
    db
      .select({ id: u.id, name: u.name, username: u.username, email: u.email, role: m.role, joinedAt: m.createdAt, createdAt: u.createdAt })
      .from(m)
      .innerJoin(u, eq(u.id, m.userId))
      .where(eq(m.householdId, householdId))
      .orderBy(m.createdAt),
    getLookups(householdId),
    db.select({ n: count() }).from(schema.creditCards).where(eq(schema.creditCards.householdId, householdId)),
    db.select({ n: count() }).from(t).where(and(eq(t.householdId, householdId), isNull(t.settlesId))),
  ]);
  // Lida como "administrador sem pessoa": vê tudo da família, sem "você" nas frases.
  const feed = await feedPage({ householdId, userId: auditorId, participantId: null, role: "owner" }, lookups, house.currency, { audit: true, size: 20 });
  return {
    house,
    members,
    contacts: lookups.participants.filter((x) => !x.hasLogin),
    categories: lookups.categories.length,
    cards: cards.n,
    transactions: txs.n,
    feed: feed.items,
    feedNext: feed.next,
  };
}
