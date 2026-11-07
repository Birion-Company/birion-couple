import "server-only";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { readSession } from "./session";

export type AuthContext = {
  userId: string;
  userName: string;
  email: string;
  householdId: string;
  householdName: string;
  currency: string;
  locale: string;
  role: "owner" | "member";
  participantId: string | null;
  /** Muda quando a foto de perfil muda (milissegundos); nulo sem foto. */
  avatarVersion: number | null;
};

/** Lê a sessão e confere no banco se a pessoa ainda é membro da família. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const session = await readSession();
  if (!session) return null;
  const db = getDb();
  const [row] = await db
    .select({
      userId: schema.users.id,
      userName: schema.users.name,
      email: schema.users.email,
      householdId: schema.households.id,
      householdName: schema.households.name,
      currency: schema.households.currency,
      locale: schema.households.locale,
      role: schema.memberships.role,
      participantId: schema.memberships.participantId,
      avatarUpdatedAt: schema.users.avatarUpdatedAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .innerJoin(schema.households, eq(schema.households.id, schema.memberships.householdId))
    .where(and(eq(schema.memberships.userId, session.uid), eq(schema.memberships.householdId, session.hid)))
    .limit(1);
  if (!row) return null;
  const { avatarUpdatedAt, ...rest } = row;
  return { ...rest, role: row.role === "owner" ? "owner" : "member", avatarVersion: avatarUpdatedAt ? avatarUpdatedAt.getTime() : null };
});

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/entrar");
  return auth;
}

export async function requireOwner(): Promise<AuthContext> {
  const auth = await requireAuth();
  if (auth.role !== "owner") throw new Error("Só quem administra a família pode fazer isso.");
  return auth;
}
