import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getAuditor, getAuth, getHomeless } from "@/lib/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  if (await getAuth()) redirect("/painel");
  if (await getAuditor()) redirect("/auditoria");
  if (await getHomeless()) redirect("/nova-familia");
  const { erro, senha } = await searchParams;
  return (
    <LoginForm
      errorCode={typeof erro === "string" ? erro : undefined}
      notice={senha === "nova" ? "Senha nova criada. Entre com ela." : undefined}
    />
  );
}
