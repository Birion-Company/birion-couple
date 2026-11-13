import "server-only";
import { and, count, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { missingDefaultRules } from "./default-rules";
import { APPROVALS_OFF, DEFAULT_CATEGORIES, DEFAULT_STATUSES, HOUSEHOLD_NAME_MAX, MEMBERS_MAX } from "./defaults";
import { insertReturning } from "@/db/ops";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Db = ReturnType<typeof getDb> | Tx;

/** Pessoas com login na família (membros), contando você. */
export async function membersCount(db: Db, householdId: string) {
  const [{ n }] = await db.select({ n: count() }).from(schema.memberships).where(eq(schema.memberships.householdId, householdId));
  return n;
}

/** Ainda cabe mais alguém com login? */
export async function hasRoomForMember(db: Db, householdId: string) {
  return (await membersCount(db, householdId)) < MEMBERS_MAX;
}

/** Contatos (pessoas sem login): quantos estão nas listas (ativos) e quantos existem no total. */
/** Contatos de uma conta (ativos e guardados): cada pessoa com login tem os seus. */
export async function contactsCount(db: Db, householdId: string, ownerUserId: string) {
  const withLogin = db
    .select({ id: schema.memberships.participantId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, householdId), isNotNull(schema.memberships.participantId)));
  const [row] = await db
    .select({ total: count(), active: sql<number>`sum(case when not ${schema.participants.archived} then 1 else 0 end)` })
    .from(schema.participants)
    .where(
      and(
        eq(schema.participants.householdId, householdId),
        eq(schema.participants.ownerUserId, ownerUserId),
        notInArray(schema.participants.id, withLogin),
      ),
    );
  return { active: row.active, total: row.total };
}

/**
 * Cria a família com os valores iniciais (status, categorias), a pessoa do dono
 * e o vínculo de administrador. Usado no cadastro por e-mail e no login com Google.
 */
export async function createHouseholdForUser(
  tx: Tx,
  input: { userId: string; userName: string; householdName: string },
): Promise<string> {
  const [home] = await insertReturning(tx, schema.households, { name: input.householdName.trim().slice(0, HOUSEHOLD_NAME_MAX), approvalsFrom: APPROVALS_OFF }, { id: schema.households.id });
  await tx.insert(schema.statuses).values(DEFAULT_STATUSES.map((s, i) => ({ ...s, householdId: home.id, sortOrder: i })));
  const cats = await insertReturning(tx, schema.categories, DEFAULT_CATEGORIES.map((c, i) => ({ ...c, householdId: home.id, sortOrder: i })), { id: schema.categories.id, name: schema.categories.name });
  // Regras prontas de categorização (uber → Transporte, ifood → Restaurantes…).
  const rules = missingDefaultRules(cats, []);
  if (rules.length) await tx.insert(schema.categoryRules).values(rules.map((r) => ({ ...r, householdId: home.id })));
  const [me] = await insertReturning(tx, schema.participants, { householdId: home.id, name: input.userName, color: "#E07A5F", sortOrder: 0 }, { id: schema.participants.id });
  await tx.insert(schema.memberships).values({ householdId: home.id, userId: input.userId, role: "owner", participantId: me.id });
  return home.id;
}
