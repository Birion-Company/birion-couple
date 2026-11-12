import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getAuditor, getAuth, getHomeless } from "@/lib/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const goInvite = typeof sp.convite === "string" ? `/convite/${sp.convite}` : null;
  if (await getAuth()) redirect(goInvite ?? "/painel");
  if (await getAuditor()) redirect("/auditoria");
  if (await getHomeless()) redirect("/nova-familia");
  const { erro, senha, convite, conta } = await searchParams;
  return (
    <LoginForm
      errorCode={typeof erro === "string" ? erro : undefined}
      notice={conta === "apagada" ? "Sua conta foi apagada." : senha === "nova" ? "Senha nova criada. Entre com ela." : typeof convite === "string" ? "Entre na sua conta para aceitar o convite." : undefined}
      convite={typeof convite === "string" ? convite : undefined}
    />
  );
}
