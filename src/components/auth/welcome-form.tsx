"use client";

import { useActionState } from "react";
import { ArrowRight, Home, User } from "lucide-react";
import { finishWelcome, type FormState } from "@/app/actions/auth";
import { AuthHeader } from "./auth-header";
import { AuthInput } from "./auth-input";

/** Primeiro acesso pelo Google: como a pessoa quer ser chamada e o nome da família (dá para mudar depois). */
export function WelcomeForm({ name, household, canRenameHousehold, convite }: { name: string; household: string; canRenameHousehold: boolean; convite?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(finishWelcome, undefined);
  return (
    <>
      <AuthHeader
        title="Boas-vindas ao Birion!"
        subtitle="Como você quer ser chamado? É assim que seu nome aparece para quem divide contas com você."
        error={state?.error}
      />
      <form action={action} className="auth-form">
        {convite && <input type="hidden" name="convite" value={convite} />}
        <AuthInput label="Seu nome" name="name" autoComplete="name" defaultValue={state?.fields?.name ?? name} icon={User} />
        {canRenameHousehold ? (
          <AuthInput label="Nome do casal" name="household" autoComplete="off" defaultValue={state?.fields?.household ?? household} icon={Home} />
        ) : (
          <input type="hidden" name="household" value={household} />
        )}
        <button className="auth-submit" disabled={pending}>
          <ArrowRight size={22} strokeWidth={2} /> {pending ? "Salvando…" : "Começar"}
        </button>
      </form>
      <p className="auth-bottom welcome-note">Você entra com o Google. Se quiser também entrar com e-mail e senha, use “Esqueci minha senha” no login para criar uma.</p>
    </>
  );
}
