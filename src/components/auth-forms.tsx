"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { acceptInvite, login, signup, type FormState } from "@/app/actions/auth";

function Field({ label, name, type = "text", defaultValue, autoComplete, hint }: {
  label: string; name: string; type?: string; defaultValue?: string; autoComplete?: string; hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        required
      />
      {hint && <span id={`${id}-hint`} className="faint">{hint}</span>}
    </div>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  return (
    <>
      <form action={action} className="card form">
        {state?.error && <p className="error" role="alert">{state.error}</p>}
        <Field label="E-mail" name="email" type="email" autoComplete="email" defaultValue={state?.fields?.email} />
        <Field label="Senha" name="password" type="password" autoComplete="current-password" />
        <button className="btn primary block" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      </form>
      <p className="auth-foot">Primeira vez? <Link href="/criar-conta">Crie a conta da sua família</Link></p>
    </>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, undefined);
  return (
    <>
      <form action={action} className="card form">
        {state?.error && <p className="error" role="alert">{state.error}</p>}
        <Field label="Nome da família ou grupo" name="household" defaultValue={state?.fields?.household} hint="Ex.: Família Souza, Casa da praia, Viagem 2027" />
        <Field label="Seu nome" name="name" autoComplete="name" defaultValue={state?.fields?.name} />
        <Field label="E-mail" name="email" type="email" autoComplete="email" defaultValue={state?.fields?.email} />
        <Field label="Senha" name="password" type="password" autoComplete="new-password" hint="Pelo menos 8 caracteres." />
        <button className="btn primary block" disabled={pending}>{pending ? "Criando…" : "Criar conta"}</button>
      </form>
      <p className="auth-foot">Já tem conta? <Link href="/entrar">Entrar</Link></p>
    </>
  );
}

export function InviteForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvite, undefined);
  return (
    <form action={action} className="card form">
      <input type="hidden" name="code" value={code} />
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <Field label="Seu nome" name="name" autoComplete="name" defaultValue={state?.fields?.name} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" defaultValue={state?.fields?.email} hint="Se você já tem conta, use o mesmo e-mail e senha." />
      <Field label="Senha" name="password" type="password" autoComplete="new-password" />
      <button className="btn primary block" disabled={pending}>{pending ? "Entrando…" : "Entrar na família"}</button>
    </form>
  );
}
