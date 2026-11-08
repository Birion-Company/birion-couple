"use server";

import bcrypt from "bcryptjs";
import { and, eq, gte, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import * as z from "zod";
import { defaultHouseholdName, FAMILY_PEOPLE_MAX, HOUSEHOLD_NAME_MAX } from "@/lib/defaults";
import { getDb, schema } from "@/db";
import { createHouseholdForUser, hasRoomForPerson } from "@/lib/household";
import { createSession, destroySession } from "@/lib/session";

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

const email = z.email({ error: "Digite um e-mail válido." }).trim().toLowerCase();
const password = z.string().min(8, { error: "A senha precisa ter pelo menos 8 caracteres." });
const name = z.string().trim().min(1, { error: "Digite seu nome." }).max(60);

const SignupSchema = z.object({
  // Opcional: sem nome, a família vira "Família de <primeiro nome>" (dá para mudar em Ajustes).
  household: z.string().trim().max(HOUSEHOLD_NAME_MAX, { error: `O nome da família pode ter até ${HOUSEHOLD_NAME_MAX} caracteres.` }).optional(),
  name,
  email,
  password,
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const fields = Object.fromEntries(["name", "email"].map((k) => [k, String(form.get(k) ?? "")]));
  const parsed = SignupSchema.safeParse({ ...fields, household: form.get("household") ?? undefined, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const { name: userName, email: mail, password: pass } = parsed.data;
  const household = parsed.data.household || defaultHouseholdName(userName);
  const db = getDb();

  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, mail)).limit(1);
  if (existing) return { error: "Já existe uma conta com este e-mail. Entre com ela.", fields };

  const passwordHash = await bcrypt.hash(pass, 10);
  const ids = await db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ email: mail, name: userName, passwordHash }).returning({ id: schema.users.id });
    const hid = await createHouseholdForUser(tx, { userId: user.id, userName, householdName: household });
    return { uid: user.id, hid };
  });
  await createSession(ids);
  redirect("/painel?bemvindo=1");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const fields = { email: String(form.get("email") ?? "") };
  const parsed = z.object({ email, password: z.string().min(1, { error: "Digite a senha." }) }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const db = getDb();
  let user: typeof schema.users.$inferSelect | undefined;
  try {
    [user] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).limit(1);
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const causeFields = cause && typeof cause === "object" ? cause as { message?: unknown; code?: unknown; detail?: unknown } : undefined;
    console.error("Login user query failed", {
      message: error instanceof Error ? error.message : String(error),
      cause,
      causeMessage: causeFields?.message,
      causeCode: causeFields?.code,
      causeDetail: causeFields?.detail,
    });
    throw error;
  }
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !ok) return { error: "E-mail ou senha incorretos.", fields };
  const [membership] = await db
    .select({ hid: schema.memberships.householdId })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id))
    .orderBy(schema.memberships.createdAt)
    .limit(1);
  if (!membership) return { error: "Esta conta não participa de nenhuma família.", fields };
  await createSession({ uid: user.id, hid: membership.hid });
  redirect("/painel");
}

export async function logout() {
  await destroySession();
  redirect("/entrar");
}

/** Entrar numa família por convite: cria a conta (ou usa a existente, conferindo a senha). */
export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "");
  const fields = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  const parsed = z.object({ name, email, password }).safeParse({ ...fields, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const db = getDb();
  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.code, code), isNull(schema.invites.usedAt), gte(schema.invites.expiresAt, new Date())))
    .limit(1);
  if (!invite) return { error: "Este convite não vale mais. Peça um novo para quem administra a família.", fields };
  const [member] = await db
    .select({ hid: schema.memberships.householdId })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.householdId, invite.householdId), eq(schema.users.email, parsed.data.email)))
    .limit(1);
  if (!member && !(await hasRoomForPerson(db, invite.householdId))) {
    return { error: `Esta família já tem ${FAMILY_PEOPLE_MAX} pessoas, o máximo. Peça para quem administra abrir espaço.`, fields };
  }

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).limit(1);
  let userId: string;
  if (existing) {
    if (!(await bcrypt.compare(parsed.data.password, existing.passwordHash))) {
      return { error: "Já existe uma conta com este e-mail e a senha não confere.", fields };
    }
    userId = existing.id;
  } else {
    const [u] = await db
      .insert(schema.users)
      .values({ email: parsed.data.email, name: parsed.data.name, passwordHash: await bcrypt.hash(parsed.data.password, 10) })
      .returning({ id: schema.users.id });
    userId = u.id;
  }
  await db.transaction(async (tx) => {
    const [already] = await tx
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.householdId, invite.householdId), eq(schema.memberships.userId, userId)))
      .limit(1);
    if (!already) {
      const [p] = await tx
        .insert(schema.participants)
        .values({ householdId: invite.householdId, name: parsed.data.name, color: "#A77BDB", sortOrder: 99 })
        .returning({ id: schema.participants.id });
      await tx.insert(schema.memberships).values({ householdId: invite.householdId, userId, role: invite.role, participantId: p.id });
    }
    await tx.update(schema.invites).set({ usedAt: new Date() }).where(eq(schema.invites.id, invite.id));
  });
  await createSession({ uid: userId, hid: invite.householdId });
  redirect("/painel?bemvindo=1");
}
