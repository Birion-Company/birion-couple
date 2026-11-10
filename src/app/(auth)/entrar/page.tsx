import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getAuditor, getAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  if (await getAuth()) redirect("/painel");
  if (await getAuditor()) redirect("/auditoria");
  const { erro } = await searchParams;
  return <LoginForm errorCode={typeof erro === "string" ? erro : undefined} />;
}
