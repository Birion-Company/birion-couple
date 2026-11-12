import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { readSession } from "@/lib/session";

export const metadata: Metadata = { title: "Confirme seu e-mail" };

/** Depois de criar a conta (ou trocar o e-mail): digitar o código de 4 números que chegou no e-mail. */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verificar-email">) {
  const session = await readSession();
  if (!session) redirect("/entrar");
  const [u] = await getDb()
    .select({ email: schema.users.email, verifiedAt: schema.users.emailVerifiedAt })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);
  if (!u) redirect("/entrar");
  const { convite, falhou } = await searchParams;
  const invite = typeof convite === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(convite) ? convite : undefined;
  if (u.verifiedAt) redirect(invite ? `/convite/${invite}` : "/painel");
  return <VerifyEmailForm email={u.email} convite={invite} sendFailed={falhou === "1"} />;
}
