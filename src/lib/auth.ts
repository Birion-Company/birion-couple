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
  /** Quando viu (ou pulou) o tutorial; nulo = ainda não viu. */
  tourSeenAt: Date | null;
};

/** Lê a sessão e confere no banco se a pessoa ainda é membro da família. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const session = await readSession();
  if (!session || !/^[0-9a-f-]{36}$/.test(session.hid)) return null;
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
      emailVerifiedAt: schema.users.emailVerifiedAt,
      tourSeenAt: schema.users.tourSeenAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .innerJoin(schema.households, eq(schema.households.id, schema.memberships.householdId))
    .where(and(eq(schema.memberships.userId, session.uid), eq(schema.memberships.householdId, session.hid)))
    .limit(1);
  // E-mail ainda não confirmado: não usa nada do app (telas, APIs e ações) até digitar o código.
  if (!row || !row.emailVerifiedAt) return null;
  const { avatarUpdatedAt, emailVerifiedAt: _v, ...rest } = row;
  void _v;
  return { ...rest, role: row.role === "owner" ? "owner" : "member", avatarVersion: avatarUpdatedAt ? avatarUpdatedAt.getTime() : null };
});

/** Sessão da conta de auditoria não tem família: usa este marcador no lugar do id. */
export const AUDIT_HID = "auditoria";

export type Auditor = { userId: string; name: string; email: string };

/** A conta de auditoria logada (só leitura), ou nulo. Confere no banco que ela continua auditora. */
export const getAuditor = cache(async (): Promise<Auditor | null> => {
  const session = await readSession();
  if (!session || session.hid !== AUDIT_HID) return null;
  const [u] = await getDb()
    .select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email, isAuditor: schema.users.isAuditor })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);
  return u?.isAuditor ? { userId: u.userId, name: u.name, email: u.email } : null;
});

export async function requireAuditor(): Promise<Auditor> {
  const a = await getAuditor();
  if (!a) redirect("/entrar");
  return a;
}

/** Sessão de quem está sem família (a família foi apagada): só pode criar uma nova. */
export const NO_HOUSEHOLD = "sem-familia";

export type Homeless = { userId: string; name: string; email: string };

/** Conta logada que não pertence a nenhuma família (ex.: depois de apagar a família). */
export const getHomeless = cache(async (): Promise<Homeless | null> => {
  const session = await readSession();
  if (!session || session.hid !== NO_HOUSEHOLD) return null;
  const db = getDb();
  const [u] = await db.select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, session.uid)).limit(1);
  if (!u) return null;
  // Se já voltou a ter família (ex.: aceitou um convite), não está mais sem família.
  const [m] = await db.select({ hid: schema.memberships.householdId }).from(schema.memberships).where(eq(schema.memberships.userId, u.userId)).limit(1);
  return m ? null : u;
});

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) {
    const s = await readSession();
    if (s) {
      const [u] = await getDb().select({ v: schema.users.emailVerifiedAt }).from(schema.users).where(eq(schema.users.id, s.uid)).limit(1);
      if (u && !u.v) redirect("/verificar-email");
    }
    redirect((await getHomeless()) ? "/nova-familia" : "/entrar");
  }
  return auth;
}

export async function requireOwner(): Promise<AuthContext> {
  const auth = await requireAuth();
  if (auth.role !== "owner") throw new Error("Só quem administra a família pode fazer isso.");
  return auth;
}
