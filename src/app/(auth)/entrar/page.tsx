import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  if (await getAuth()) redirect("/painel");
  const { erro } = await searchParams;
  return (
    <div className="login-page">
      <h1>Bem-vindo de volta!</h1>
      <p className="auth-sub">Faça login para acessar sua planilha financeira</p>
      <LoginForm errorCode={typeof erro === "string" ? erro : undefined} />
    </div>
  );
}
