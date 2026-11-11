import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { getAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignupPage({ searchParams }: PageProps<"/criar-conta">) {
  const { convite } = await searchParams;
  const invite = typeof convite === "string" ? convite : undefined;
  // Já logado vindo de um convite: vai direto aceitar.
  if (await getAuth()) redirect(invite ? `/convite/${invite}` : "/painel");
  return <SignupForm convite={invite} />;
}
