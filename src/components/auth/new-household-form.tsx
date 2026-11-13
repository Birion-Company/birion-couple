"use client";

import { useActionState } from "react";
import { Home, LogOut } from "lucide-react";
import { createNewHousehold, logout, type FormState } from "@/app/actions/auth";
import { AuthHeader } from "./auth-header";
import { AuthInput } from "./auth-input";

/** Conta sem família (a dela foi apagada): para usar o app de novo, cria uma família nova, vazia. */
export function NewHouseholdForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createNewHousehold, undefined);
  return (
    <>
      <AuthHeader
        title={`Olá, ${name.split(" ")[0]}`}
        subtitle="Sua conta não está em nenhum casal. Crie um novo (começa do zero) ou aceite o convite do seu par."
        error={state?.error}
      />
      <form action={action} className="auth-form">
        <AuthInput label="Nome do casal (opcional)" name="household" autoComplete="off" defaultValue={state?.fields?.household} icon={Home} />
        <button className="auth-submit" disabled={pending}>
          <Home size={22} strokeWidth={2} /> {pending ? "Criando…" : "Criar casal"}
        </button>
      </form>
      <form action={logout} className="auth-bottom">
        <button type="submit" className="auth-link-btn">
          <LogOut size={14} /> Sair
        </button>
      </form>
    </>
  );
}
