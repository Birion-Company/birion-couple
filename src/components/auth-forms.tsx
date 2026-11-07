"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Home, Lock, LogIn, Mail, User, UserPlus } from "lucide-react";
import { acceptInvite, signup, type FormState } from "@/app/actions/auth";
import { AuthInput as Field } from "./auth/auth-input";
import { GoogleLoginButton } from "./auth/google-login-button";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, undefined);
  return (
    <>
      <form action={action} className="auth-form">
        {state?.error && (
          <p className="auth-error" role="alert">
            {state.error}
          </p>
        )}
        <Field
          label="Nome da família ou grupo"
          name="household"
          defaultValue={state?.fields?.household}
          hint="Ex.: Família Souza, Casa da praia, Viagem 2027"
          icon={Home}
        />
        <Field label="Seu nome" name="name" autoComplete="name" defaultValue={state?.fields?.name} icon={User} />
        <Field label="Seu e-mail" name="email" type="email" autoComplete="email" defaultValue={state?.fields?.email} icon={Mail} />
        <Field label="Crie uma senha" name="password" type="password" autoComplete="new-password" hint="Pelo menos 8 caracteres." icon={Lock} />
        <button className="auth-submit" disabled={pending}>
          <UserPlus size={20} strokeWidth={1.8} /> {pending ? "Criando…" : "Criar conta"}
        </button>
      </form>
      <div className="auth-sep">
        <span>ou</span>
      </div>
      <GoogleLoginButton label="Cadastrar com Google" />
      <p className="auth-bottom">
        Já tem uma conta? <Link href="/entrar">Entrar</Link>
      </p>
    </>
  );
}

export function InviteForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvite, undefined);
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="code" value={code} />
      {state?.error && (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      )}
      <Field label="Seu nome" name="name" autoComplete="name" defaultValue={state?.fields?.name} icon={User} />
      <Field
        label="Seu e-mail"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state?.fields?.email}
        hint="Se você já tem conta, use o mesmo e-mail e senha."
        icon={Mail}
      />
      <Field label="Sua senha" name="password" type="password" autoComplete="new-password" icon={Lock} />
      <button className="auth-submit" disabled={pending}>
        <LogIn size={20} strokeWidth={1.8} /> {pending ? "Entrando…" : "Entrar na família"}
      </button>
    </form>
  );
}
