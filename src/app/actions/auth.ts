"use server";

import bcrypt from "bcryptjs";
import { and, asc, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import * as z from "zod";
import { defaultHouseholdName, HOUSEHOLD_NAME_MAX } from "@/lib/defaults";
import { getDb, schema } from "@/db";
import { createHouseholdForUser } from "@/lib/household";
import { AUDIT_HID, NO_HOUSEHOLD, getHomeless, requireAuth } from "@/lib/auth";
import { createSession, destroySession } from "@/lib/session";
import { sendVerifyCode } from "@/lib/email-verify";
import { validateUsername } from "@/lib/username-server";

const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MIN = 15;

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


/** Código de convite vindo do formulário (entrar ou criar conta a partir de um convite). */
function inviteFrom(form: FormData) {
  const c = String(form.get("convite") ?? "");
  return /^[A-Za-z0-9_-]{6,80}$/.test(c) ? c : null;
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const fields = Object.fromEntries(["name", "username", "email"].map((k) => [k, String(form.get(k) ?? "")]));
  const parsed = SignupSchema.safeParse({ ...fields, household: form.get("household") ?? undefined, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const { name: userName, email: mail, password: pass } = parsed.data;
  const household = parsed.data.household || defaultHouseholdName(userName);
  const db = getDb();
  const uname = await validateUsername(db, fields.username);
  if (!uname.ok) return { error: uname.error, fields };

  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, mail)).limit(1);
  if (existing) return { error: "Já existe uma conta com este e-mail. Entre com ela.", fields };

  const passwordHash = await bcrypt.hash(pass, 10);
  const ids = await db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ email: mail, name: userName, username: uname.value, passwordHash }).returning({ id: schema.users.id });
    const hid = await createHouseholdForUser(tx, { userId: user.id, userName, householdName: household });
    return { uid: user.id, hid };
  });
  await createSession(ids);
  // Antes de usar o app, confirma o e-mail com um código de 4 números (depois segue para o convite, se veio de um).
  const fail = await sendVerifyCode({ id: ids.uid, name: userName, email: mail });
  const invite = inviteFrom(form);
  const q = new URLSearchParams();
  if (invite) q.set("convite", invite);
  if (fail) q.set("falhou", "1");
  redirect(`/verificar-email${q.size ? `?${q}` : ""}`);
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
  // Muitas senhas erradas seguidas para este e-mail: espera antes de tentar de novo (vale mesmo com a senha certa).
  const F = schema.loginFailures;
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000);
  const fails = await db
    .select({ at: F.createdAt })
    .from(F)
    .where(and(eq(F.email, parsed.data.email), gte(F.createdAt, windowStart)))
    .orderBy(asc(F.createdAt));
  if (fails.length >= LOGIN_MAX_FAILS) {
    const wait = Math.max(1, Math.ceil((fails[0].at.getTime() + LOGIN_WINDOW_MIN * 60_000 - Date.now()) / 60_000));
    return { error: `Muitas tentativas com senha errada. Espere ${wait} minuto${wait === 1 ? "" : "s"} ou use “Esqueci minha senha”.`, fields };
  }
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !ok) {
    await db.insert(F).values({ email: parsed.data.email });
    const left = LOGIN_MAX_FAILS - fails.length - 1;
    return { error: left > 0 && left <= 2 ? `E-mail ou senha incorretos. ${left === 1 ? "Resta 1 tentativa" : `Restam ${left} tentativas`} antes de esperar ${LOGIN_WINDOW_MIN} minutos.` : "E-mail ou senha incorretos.", fields };
  }
  await db.delete(F).where(eq(F.email, parsed.data.email));
  // Conta de auditoria: não tem família; vai para a área de auditoria (só leitura).
  if (user.isAuditor) {
    await createSession({ uid: user.id, hid: AUDIT_HID });
    redirect("/auditoria");
  }
  const [membership] = await db
    .select({ hid: schema.memberships.householdId })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id))
    .orderBy(schema.memberships.createdAt)
    .limit(1);
  // Entrou a partir de um convite: volta para aceitar a família.
  const invite = inviteFrom(form);
  // Sem família (a dela foi apagada): entra, mas só pode criar uma família nova.
  if (!membership) {
    await createSession({ uid: user.id, hid: NO_HOUSEHOLD });
    redirect(invite ? `/convite/${invite}` : "/nova-familia");
  }
  await createSession({ uid: user.id, hid: membership.hid });
  redirect(invite ? `/convite/${invite}` : "/painel");
}

export async function logout() {
  await destroySession();
  redirect("/entrar");
}

/** Entrar numa família por convite: cria a conta (ou usa a existente, conferindo a senha). */
export async function createNewHousehold(_: FormState, form: FormData): Promise<FormState> {
  const me = await getHomeless();
  if (!me) redirect("/entrar");
  const raw = String(form.get("household") ?? "").trim();
  if (raw.length > HOUSEHOLD_NAME_MAX) return { error: `O nome da família pode ter até ${HOUSEHOLD_NAME_MAX} caracteres.`, fields: { household: raw } };
  const hid = await getDb().transaction((tx) =>
    createHouseholdForUser(tx, { userId: me.userId, userName: me.name, householdName: raw || defaultHouseholdName(me.name) }),
  );
  await createSession({ uid: me.userId, hid });
  redirect("/painel?bemvindo=1");
}

const WelcomeSchema = z.object({
  name,
  household: z.string().trim().min(1, { error: "Dê um nome para a família." }).max(HOUSEHOLD_NAME_MAX, { error: `O nome da família pode ter até ${HOUSEHOLD_NAME_MAX} caracteres.` }),
});

/**
 * Primeiro acesso pelo Google: a pessoa confirma como quer ser chamada (vem o nome do Google) e o nome
 * da família. Atualiza o nome da conta, o da pessoa dentro da família e o da família.
 */
export async function finishWelcome(_: FormState, form: FormData): Promise<FormState> {
  const auth = await requireAuth();
  const fields = { name: String(form.get("name") ?? ""), household: String(form.get("household") ?? ""), username: String(form.get("username") ?? "") };
  const parsed = WelcomeSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const db = getDb();
  const uname = await validateUsername(db, fields.username, auth.userId);
  if (!uname.ok) return { error: uname.error, fields };
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ name: parsed.data.name, username: uname.value }).where(eq(schema.users.id, auth.userId));
    if (auth.participantId) {
      await tx
        .update(schema.participants)
        .set({ name: parsed.data.name })
        .where(and(eq(schema.participants.id, auth.participantId), eq(schema.participants.householdId, auth.householdId)));
    }
    if (auth.role === "owner") await tx.update(schema.households).set({ name: parsed.data.household }).where(eq(schema.households.id, auth.householdId));
  });
  const invite = inviteFrom(form);
  redirect(invite ? `/convite/${invite}` : "/painel?bemvindo=1");
}
