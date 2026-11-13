"use server";

import bcrypt from "bcryptjs";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { codeBox, emailConfigured, emailLayout, esc, sendEmail } from "@/lib/email";

/**
 * "Esqueci minha senha":
 * 1. a pessoa informa o e-mail e recebe um código de 4 dígitos (vale 15 minutos);
 * 2. digita o código (até 5 tentativas por código);
 * 3. cria uma senha nova.
 * A resposta do passo 1 é sempre a mesma, exista a conta ou não (ninguém descobre e-mails cadastrados).
 */
export type ResetResult = { ok: true; message?: string } | { ok: false; error: string };

const VALID_MIN = 15;
const MAX_ATTEMPTS = 5;
const t = schema.passwordResets;

const emailSchema = z.email({ error: "Digite um e-mail válido." }).trim().toLowerCase();
const codeSchema = z.string().trim().regex(/^\d{4}$/, { error: "O código tem 4 números." });
const passwordSchema = z.string().min(8, { error: "A senha precisa ter pelo menos 8 caracteres." });

/** Hash do código, preso à pessoa (o mesmo código de outra pessoa dá outro hash). */
function hashCode(userId: string, code: string) {
  return createHmac("sha256", process.env.AUTH_SECRET || "dev-only-secret").update(`${userId}:${code}`).digest("hex");
}

async function findUser(email: string) {
  const [user] = await getDb().select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return user ?? null;
}

const SENT = "Se existir uma conta com esse e-mail, mandamos um código de 4 números. Confira também o spam.";

export async function requestPasswordReset(rawEmail: string): Promise<ResetResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (process.env.NODE_ENV === "production" && process.env.LOCAL_HTTP !== "1" && !emailConfigured()) {
    return { ok: false, error: "O envio de e-mail ainda não foi configurado neste site. Fale com quem administra o Birion." };
  }
  const user = await findUser(parsed.data);
  if (!user) return { ok: true, message: SENT };
  const db = getDb();
  // Sem enxurrada: no máximo um código por minuto e 5 por hora para a mesma conta.
  const recent = await db
    .select({ createdAt: t.createdAt })
    .from(t)
    .where(and(eq(t.userId, user.id), eq(t.purpose, "reset"), gte(t.createdAt, new Date(Date.now() - 60 * 60 * 1000))))
    .orderBy(desc(t.createdAt));
  if (recent.length >= 5) return { ok: false, error: "Muitos pedidos seguidos. Espere um pouco e tente de novo." };
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < 60 * 1000) return { ok: false, error: "Acabamos de mandar um código. Espere 1 minuto para pedir outro." };

  const code = String(randomInt(0, 10000)).padStart(4, "0");
  // Só o último código vale.
  await db.update(t).set({ usedAt: new Date() }).where(and(eq(t.userId, user.id), eq(t.purpose, "reset"), isNull(t.usedAt)));
  await db.insert(t).values({ userId: user.id, codeHash: hashCode(user.id, code), expiresAt: new Date(Date.now() + VALID_MIN * 60 * 1000) });

  const first = user.name.split(" ")[0] || user.name;
  const fail = await sendEmail({
    to: parsed.data,
    subject: `${code} é o seu código do Birion Finance`,
    text: `Olá, ${first}!\n\nSeu código para criar uma senha nova no Birion Finance é: ${code}\n\nEle vale por ${VALID_MIN} minutos. Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.`,
    html: emailLayout(
      "Seu código de acesso",
      `<p style="margin:0 0 28px">Olá, ${esc(first)}! Use este código para criar uma senha nova:</p>${codeBox(code)}
<p style="margin:0;font-size:14px;line-height:20px;color:#6b6b68">Vale por ${VALID_MIN} minutos. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`,
      { eyebrow: "Nova senha", preheader: `Seu código: ${code}` },
    ),
  });
  if (fail) {
    // O código não chegou: não conta para o limite de 1 por minuto.
    await db.delete(t).where(and(eq(t.userId, user.id), eq(t.purpose, "reset"), isNull(t.usedAt)));
    return { ok: false, error: `Não conseguimos mandar o e-mail agora (${fail}). Tente de novo em alguns minutos.` };
  }
  return { ok: true, message: SENT };
}

/** Confere o código (gasta uma tentativa se estiver errado). */
async function checkCode(email: string, code: string): Promise<{ ok: true; userId: string; resetId: string } | { ok: false; error: string }> {
  const user = await findUser(email);
  const wrong = { ok: false as const, error: "Código errado ou vencido. Confira o e-mail ou peça um novo." };
  if (!user) return wrong;
  const db = getDb();
  const [r] = await db
    .select()
    .from(t)
    .where(and(eq(t.userId, user.id), eq(t.purpose, "reset"), isNull(t.usedAt), gte(t.expiresAt, new Date())))
    .orderBy(desc(t.createdAt))
    .limit(1);
  if (!r) return wrong;
  if (r.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Muitas tentativas erradas. Peça um código novo." };
  const a = Buffer.from(hashCode(user.id, code));
  const b = Buffer.from(r.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.update(t).set({ attempts: r.attempts + 1 }).where(eq(t.id, r.id));
    const left = MAX_ATTEMPTS - r.attempts - 1;
    return { ok: false, error: left > 0 ? `Código errado. ${left === 1 ? "Resta 1 tentativa" : `Restam ${left} tentativas`}.` : "Muitas tentativas erradas. Peça um código novo." };
  }
  return { ok: true, userId: user.id, resetId: r.id };
}

export async function verifyResetCode(rawEmail: string, rawCode: string): Promise<ResetResult> {
  const e = emailSchema.safeParse(rawEmail);
  const c = codeSchema.safeParse(rawCode);
  if (!e.success) return { ok: false, error: e.error.issues[0].message };
  if (!c.success) return { ok: false, error: c.error.issues[0].message };
  const r = await checkCode(e.data, c.data);
  return r.ok ? { ok: true } : r;
}

export async function resetPassword(rawEmail: string, rawCode: string, newPassword: string, confirm: string): Promise<ResetResult> {
  const e = emailSchema.safeParse(rawEmail);
  const c = codeSchema.safeParse(rawCode);
  const p = passwordSchema.safeParse(newPassword);
  if (!e.success) return { ok: false, error: e.error.issues[0].message };
  if (!c.success) return { ok: false, error: c.error.issues[0].message };
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (newPassword !== confirm) return { ok: false, error: "As duas senhas não são iguais." };
  const r = await checkCode(e.data, c.data);
  if (!r.ok) return r;
  const db = getDb();
  await db.transaction(async (q) => {
    // O código chegou no e-mail: ele também fica confirmado.
    await q
      .update(schema.users)
      .set({ passwordHash: await bcrypt.hash(p.data, 10), emailVerifiedAt: sql`coalesce(${schema.users.emailVerifiedAt}, now())` })
      .where(eq(schema.users.id, r.userId));
    // Código usado (e qualquer outro em aberto da mesma conta) não vale mais.
    await q.update(t).set({ usedAt: new Date() }).where(and(eq(t.userId, r.userId), eq(t.purpose, "reset"), isNull(t.usedAt)));
  });
  // Senha nova: as tentativas erradas de antes não contam mais.
  await db.delete(schema.loginFailures).where(eq(schema.loginFailures.email, e.data));
  return { ok: true, message: "Senha nova criada. Entre com ela." };
}
