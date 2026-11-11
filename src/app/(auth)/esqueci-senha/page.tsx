import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default async function ForgotPasswordPage() {
  if (await getAuth()) redirect("/painel");
  return <ForgotPasswordForm />;
}
