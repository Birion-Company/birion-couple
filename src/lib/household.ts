import "server-only";
import { getDb, schema } from "@/db";
import { DEFAULT_CATEGORIES, DEFAULT_STATUSES } from "./defaults";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Cria a família com os valores iniciais (status, categorias), a pessoa do dono
 * e o vínculo de administrador. Usado no cadastro por e-mail e no login com Google.
 */
export async function createHouseholdForUser(
  tx: Tx,
  input: { userId: string; userName: string; householdName: string },
): Promise<string> {
  const [home] = await tx.insert(schema.households).values({ name: input.householdName }).returning({ id: schema.households.id });
  await tx.insert(schema.statuses).values(DEFAULT_STATUSES.map((s, i) => ({ ...s, householdId: home.id, sortOrder: i })));
  await tx.insert(schema.categories).values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, householdId: home.id, sortOrder: i })));
  const [me] = await tx
    .insert(schema.participants)
    .values({ householdId: home.id, name: input.userName, color: "#1AC4DB", sortOrder: 0 })
    .returning({ id: schema.participants.id });
  await tx.insert(schema.memberships).values({ householdId: home.id, userId: input.userId, role: "owner", participantId: me.id });
  return home.id;
}
