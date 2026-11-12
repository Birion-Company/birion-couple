import "server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/db";

type Conn = Pick<ReturnType<typeof getDb>, "select">;

/**
 * Pessoas que esta conta pode colocar num lançamento: quem tem login na família, os próprios contatos
 * e contatos sem dono (de quem saiu). Contato de outra pessoa da família não (é só dela).
 */
export async function usablePeople(householdId: string, userId: string, conn: Conn = getDb()) {
  const P = schema.participants;
  const logins = conn.select({ id: schema.memberships.participantId }).from(schema.memberships).where(eq(schema.memberships.householdId, householdId));
  const rows = await conn
    .select({ id: P.id })
    .from(P)
    .where(and(eq(P.householdId, householdId), or(inArray(P.id, logins as never), eq(P.ownerUserId, userId), isNull(P.ownerUserId))));
  return new Set(rows.map((r) => r.id));
}

/**
 * Confere as pessoas de um lançamento. `alreadyIn`: quem já estava nele (editar um lançamento antigo que
 * tem o contato de outra pessoa continua valendo). Devolve a mensagem de erro, ou null.
 */
export async function checkPeople(householdId: string, userId: string, ids: (string | null | undefined)[], alreadyIn: (string | null | undefined)[] = []) {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (want.length === 0) return null;
  const ok = await usablePeople(householdId, userId);
  const keep = new Set(alreadyIn.filter((x): x is string => !!x));
  return want.every((id) => ok.has(id) || keep.has(id)) ? null : "Pessoa inválida.";
}
