import "server-only";
import { and, count, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DEFAULT_CATEGORIES, DEFAULT_STATUSES, FAMILY_PEOPLE_MAX, HOUSEHOLD_NAME_MAX } from "./defaults";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Db = ReturnType<typeof getDb> | Tx;

/**
 * Quantas pessoas ativas contam no limite da família. Não contam: quem administra (você), as arquivadas
 * e as avulsas.
 */
export async function activePeopleCount(db: Db, householdId: string) {
  const owners = db
    .select({ id: schema.memberships.participantId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, householdId), eq(schema.memberships.role, "owner"), isNotNull(schema.memberships.participantId)));
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.participants)
    .where(
      and(
        eq(schema.participants.householdId, householdId),
        eq(schema.participants.archived, false),
        eq(schema.participants.temporary, false),
        notInArray(schema.participants.id, owners),
      ),
    );
  return n;
}

/** Ainda cabe mais uma pessoa ativa na família? */
export async function hasRoomForPerson(db: Db, householdId: string) {
  return (await activePeopleCount(db, householdId)) < FAMILY_PEOPLE_MAX;
}

/**
 * Cria a família com os valores iniciais (status, categorias), a pessoa do dono
 * e o vínculo de administrador. Usado no cadastro por e-mail e no login com Google.
 */
export async function createHouseholdForUser(
  tx: Tx,
  input: { userId: string; userName: string; householdName: string },
): Promise<string> {
  const [home] = await tx.insert(schema.households).values({ name: input.householdName.trim().slice(0, HOUSEHOLD_NAME_MAX) }).returning({ id: schema.households.id });
  await tx.insert(schema.statuses).values(DEFAULT_STATUSES.map((s, i) => ({ ...s, householdId: home.id, sortOrder: i })));
  await tx.insert(schema.categories).values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, householdId: home.id, sortOrder: i })));
  const [me] = await tx
    .insert(schema.participants)
    .values({ householdId: home.id, name: input.userName, color: "#1AC4DB", sortOrder: 0 })
    .returning({ id: schema.participants.id });
  await tx.insert(schema.memberships).values({ householdId: home.id, userId: input.userId, role: "owner", participantId: me.id });
  return home.id;
}
