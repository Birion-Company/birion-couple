import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { getAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getAuth()) redirect("/painel");
  return (
    <>
      <h1>Bem-vindo de volta!</h1>
      <p className="muted">Faça login para acessar as finanças da sua família.</p>
      <LoginForm />
    </>
  );
}
