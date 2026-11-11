import "server-only";
import { and, eq, gte, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Convite válido (não usado e não vencido), com o nome da família e de quem convidou. */
export async function findInvite(code: string) {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(code)) return null;
  const [invite] = await getDb()
    .select({
      id: schema.invites.id,
      householdId: schema.invites.householdId,
      role: schema.invites.role,
      participantId: schema.invites.participantId,
      household: schema.households.name,
      createdBy: schema.invites.createdBy,
    })
    .from(schema.invites)
    .innerJoin(schema.households, eq(schema.households.id, schema.invites.householdId))
    .where(and(eq(schema.invites.code, code), isNull(schema.invites.usedAt), gte(schema.invites.expiresAt, new Date())))
    .limit(1);
  return invite ?? null;
}

