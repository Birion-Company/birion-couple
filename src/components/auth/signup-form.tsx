"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Lock, Mail, User, UserPlus } from "lucide-react";
import { signup, type FormState } from "@/app/actions/auth";
import { AuthHeader } from "./auth-header";
import { AuthInput } from "./auth-input";
import { GoogleLoginButton } from "./google-login-button";

/** Cadastro: mesma estrutura e medidas do login. O nome da família é criado sozinho e muda em Ajustes. */
export function SignupForm({ convite }: { convite?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, undefined);
  return (
    <>
      <AuthHeader title="Crie sua conta" subtitle="Comece a organizar as finanças de vocês dois" error={state?.error} />
      <form action={action} className="auth-form">
        {convite && <input type="hidden" name="convite" value={convite} />}
        <AuthInput label="Seu nome" name="name" autoComplete="name" defaultValue={state?.fields?.name} icon={User} />
        <AuthInput label="Seu e-mail" name="email" type="email" autoComplete="email" defaultValue={state?.fields?.email} icon={Mail} />
        <AuthInput label="Crie uma senha (mín. 8 caracteres)" name="password" type="password" autoComplete="new-password" icon={Lock} />
        <button className="auth-submit" disabled={pending}>
          <UserPlus size={24} strokeWidth={2} /> {pending ? "Criando…" : "Criar conta"}
        </button>
      </form>
      <div className="auth-sep">
        <span>ou</span>
      </div>
      <GoogleLoginButton label="Cadastrar com Google" convite={convite} />
      <p className="auth-bottom">
        Já tem uma conta? <Link href={convite ? `/entrar?convite=${encodeURIComponent(convite)}` : "/entrar"}>Entrar</Link>
      </p>
    </>
  );
}
