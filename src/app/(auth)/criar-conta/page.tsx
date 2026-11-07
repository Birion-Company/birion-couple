import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { getAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignupPage() {
  if (await getAuth()) redirect("/painel");
  return <SignupForm />;
}
