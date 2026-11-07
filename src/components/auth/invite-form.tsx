"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Lock, LogIn, Mail, User } from "lucide-react";
import { acceptInvite, type FormState } from "@/app/actions/auth";
import { AuthHeader } from "./auth-header";
import { AuthInput } from "./auth-input";

/** Aceitar convite: mesmo visual do login. Quem já tem conta usa o mesmo e-mail e senha. */
export function InviteForm({ code, household }: { code: string; household: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvite, undefined);
  return (
    <>
      <AuthHeader title={`Entrar em “${household}”`} subtitle="Você foi convidado para acompanhar as finanças desta família" error={state?.error} />
      <form action={action} className="auth-form">
        <input type="hidden" name="code" value={code} />
        <AuthInput label="Seu nome" name="name" autoComplete="name" defaultValue={state?.fields?.name} icon={User} />
        <AuthInput label="Seu e-mail" name="email" type="email" autoComplete="email" defaultValue={state?.fields?.email} icon={Mail} />
        <AuthInput label="Sua senha" name="password" type="password" autoComplete="new-password" icon={Lock} />
        <button className="auth-submit" disabled={pending}>
          <LogIn size={24} strokeWidth={2} /> {pending ? "Entrando…" : "Entrar na família"}
        </button>
      </form>
      <p className="auth-bottom">
        Já tem conta? Use o mesmo e-mail e senha. <Link href="/entrar">Entrar</Link>
      </p>
    </>
  );
}
