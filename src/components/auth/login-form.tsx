"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Lock, LogIn, User } from "lucide-react";
import { login, type FormState } from "@/app/actions/auth";
import { AuthHeader } from "./auth-header";
import { AuthInput } from "./auth-input";
import { GoogleLoginButton } from "./google-login-button";

const ERRORS: Record<string, string> = {
  "google-indisponivel": "O login com Google ainda não foi configurado neste site.",
  "google-cancelado": "Login com Google cancelado.",
  "google-falhou": "Não foi possível entrar com o Google. Tente de novo.",
  "sem-familia": "Esta conta não participa de nenhuma família.",
};

export function LoginForm({ errorCode, notice, convite }: { errorCode?: string; notice?: string; convite?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  const error = state?.error ?? (errorCode ? ERRORS[errorCode] : undefined);
  return (
    <>
      <AuthHeader title="Olá, seja bem-vindo!" subtitle={notice ?? "Faça login para acessar sua planilha financeira"} error={error} />
      <form action={action} className="auth-form">
        {convite && <input type="hidden" name="convite" value={convite} />}
        <AuthInput label="E-mail ou nome de usuário" name="email" type="text" autoComplete="username" defaultValue={state?.fields?.email} icon={User} />
        <AuthInput label="Sua senha" name="password" type="password" autoComplete="current-password" icon={Lock} />
        <Link href="/esqueci-senha" className="auth-forgot">
          Esqueci minha senha
        </Link>
        <button className="auth-submit" disabled={pending}>
          <LogIn size={24} strokeWidth={2} /> {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <div className="auth-sep">
        <span>ou</span>
      </div>
      <GoogleLoginButton convite={convite} />
      <p className="auth-bottom">
        Não tem uma conta? <Link href={convite ? `/criar-conta?convite=${encodeURIComponent(convite)}` : "/criar-conta"}>Cadastre-se</Link>
      </p>
      <p className="auth-legal">
        <Link href="/privacidade">Política de privacidade</Link>
      </p>
    </>
  );
}
