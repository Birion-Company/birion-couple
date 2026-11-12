import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { emailLayout, esc, sendEmail } from "./email";

/**
 * Confirmar o e-mail ao criar a conta: um código de 4 números (vale 30 minutos, 5 tentativas).
 * Usa a mesma tabela do "esqueci a senha", com purpose = "verify".
 */
export const VERIFY_VALID_MIN = 30;
const t = schema.passwordResets;

export function verifyHash(userId: string, code: string) {
  return createHmac("sha256", process.env.AUTH_SECRET || "dev-only-secret").update(`verify:${userId}:${code}`).digest("hex");
}

/** Manda (ou manda de novo) o código. Devolve null se saiu, ou o motivo para mostrar na tela. */
export async function sendVerifyCode(user: { id: string; name: string; email: string }): Promise<string | null> {
  const db = getDb();
  const recent = await db
    .select({ createdAt: t.createdAt })
    .from(t)
    .where(and(eq(t.userId, user.id), eq(t.purpose, "verify"), gte(t.createdAt, new Date(Date.now() - 60 * 60 * 1000))))
    .orderBy(desc(t.createdAt));
  if (recent.length >= 5) return "Muitos pedidos seguidos. Espere um pouco e tente de novo.";
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < 60 * 1000) return "Acabamos de mandar um código. Espere 1 minuto para pedir outro.";

  const code = String(randomInt(0, 10000)).padStart(4, "0");
  // Só o último código vale.
  await db.update(t).set({ usedAt: new Date() }).where(and(eq(t.userId, user.id), eq(t.purpose, "verify"), isNull(t.usedAt)));
  await db.insert(t).values({ userId: user.id, purpose: "verify", codeHash: verifyHash(user.id, code), expiresAt: new Date(Date.now() + VERIFY_VALID_MIN * 60 * 1000) });

  const first = user.name.split(" ")[0] || user.name;
  const fail = await sendEmail({
    to: user.email,
    subject: `${code} é o seu código do Birion Finance`,
    text: `Olá, ${first}!\n\nPara confirmar seu e-mail no Birion Finance, use o código: ${code}\n\nEle vale por ${VERIFY_VALID_MIN} minutos. Se não foi você que criou a conta, ignore este e-mail.`,
    html: emailLayout(
      "Confirme seu e-mail",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Olá, ${esc(first)}! Para terminar de criar sua conta no Birion Finance, use este código:</p>
<p style="margin:0 0 16px;text-align:center"><span style="display:inline-block;padding:14px 22px;border-radius:12px;background:#e6fbfd;color:#0f1d38;font-size:34px;font-weight:700;letter-spacing:12px">${code}</span></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#475569">O código vale por ${VERIFY_VALID_MIN} minutos. Se não foi você que criou a conta, ignore este e-mail.</p>`,
    ),
  });
  if (fail) {
    // Não chegou: não conta para o limite.
    await db.delete(t).where(and(eq(t.userId, user.id), eq(t.purpose, "verify"), isNull(t.usedAt)));
    return `Não conseguimos mandar o e-mail agora (${fail}). Tente de novo em alguns minutos.`;
  }
  return null;
}

/** A conta logada (pela sessão) ainda sem e-mail confirmado, ou nulo. */
export async function emailVerified(userId: string) {
  const [u] = await getDb().select({ at: schema.users.emailVerifiedAt }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return !!u?.at;
}
