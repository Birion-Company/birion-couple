"use server";

import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { sendVerifyCode, verifyHash } from "@/lib/email-verify";
import { readSession } from "@/lib/session";

export type VerifyResult = { ok: true; message?: string } | { ok: false; error: string } | undefined;

const t = schema.passwordResets;
const MAX_ATTEMPTS = 5;

async function me() {
  const s = await readSession();
  if (!s) redirect("/entrar");
  const [u] = await getDb()
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, verifiedAt: schema.users.emailVerifiedAt })
    .from(schema.users)
    .where(eq(schema.users.id, s.uid))
    .limit(1);
  if (!u) redirect("/entrar");
  return u;
}

const safeInvite = (c?: string | null) => (c && /^[A-Za-z0-9_-]{6,80}$/.test(c) ? c : null);

/** "Mandar outro código". */
export async function resendVerifyCode(): Promise<VerifyResult> {
  const u = await me();
  if (u.verifiedAt) return { ok: true, message: "Seu e-mail já está confirmado." };
  const fail = await sendVerifyCode(u);
  return fail ? { ok: false, error: fail } : { ok: true, message: `Mandamos um código novo para ${u.email}. Confira também o spam.` };
}

/** Confere o código; certo, confirma o e-mail e entra no app (ou segue para o convite). */
export async function confirmEmail(rawCode: string, convite?: string | null): Promise<VerifyResult> {
  const u = await me();
  const invite = safeInvite(convite);
  const next = invite ? `/convite/${invite}` : "/painel?bemvindo=1";
  if (u.verifiedAt) redirect(next);
  const code = rawCode.trim();
  if (!/^\d{4}$/.test(code)) return { ok: false, error: "O código tem 4 números." };
  const db = getDb();
  const [r] = await db
    .select()
    .from(t)
    .where(and(eq(t.userId, u.id), eq(t.purpose, "verify"), isNull(t.usedAt), gte(t.expiresAt, new Date())))
    .orderBy(desc(t.createdAt))
    .limit(1);
  if (!r) return { ok: false, error: "Código vencido. Toque em “Mandar outro código”." };
  if (r.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Muitas tentativas erradas. Peça um código novo." };
  const a = Buffer.from(verifyHash(u.id, code));
  const b = Buffer.from(r.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.update(t).set({ attempts: r.attempts + 1 }).where(eq(t.id, r.id));
    const left = MAX_ATTEMPTS - r.attempts - 1;
    return { ok: false, error: left > 0 ? `Código errado. ${left === 1 ? "Resta 1 tentativa" : `Restam ${left} tentativas`}.` : "Muitas tentativas erradas. Peça um código novo." };
  }
  await db.transaction(async (q) => {
    await q.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, u.id));
    await q.update(t).set({ usedAt: new Date() }).where(and(eq(t.userId, u.id), eq(t.purpose, "verify"), isNull(t.usedAt)));
  });
  redirect(next);
}
