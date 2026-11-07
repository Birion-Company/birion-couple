import type { Metadata } from "next";
import { SignupForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignupPage() {
  return (
    <>
      <h1>Crie a conta da família</h1>
      <p className="muted">Depois você convida as outras pessoas e configura tudo do seu jeito.</p>
      <SignupForm />
    </>
  );
}
