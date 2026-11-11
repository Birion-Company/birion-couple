"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, LogIn, UserPlus } from "lucide-react";
import { acceptInviteLoggedIn } from "@/app/actions/invite";
import { AuthHeader } from "./auth-header";
import { GoogleLoginButton } from "./google-login-button";

/**
 * Convite para uma família:
 * - logado: "Fulano te convidou para a família X" → Aceitar (sai da família atual, onde vira pessoa sem login);
 * - deslogado: entrar ou criar conta; depois volta aqui para aceitar.
 */
export function InviteAccept({
  code,
  household,
  inviter,
  current,
  alreadyMember,
}: {
  code: string;
  household: string;
  inviter: string | null;
  /** Família em que a pessoa está agora (logada); nulo se deslogada. */
  current: { name: string; household: string | null } | null;
  alreadyMember: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const who = inviter ? `${inviter.split(" ")[0]} te convidou` : "Você foi convidado";
  const q = `?convite=${encodeURIComponent(code)}`;

  if (!current) {
    return (
      <>
        <AuthHeader title={`Entrar em “${household}”`} subtitle={`${who} para dividir as finanças desta família. Entre ou crie sua conta para aceitar.`} />
        <div className="auth-form">
          <Link href={`/entrar${q}`} className="auth-submit">
            <LogIn size={22} strokeWidth={2} /> Já tenho conta: entrar
          </Link>
          <Link href={`/criar-conta${q}`} className="auth-google invite-create">
            <UserPlus size={20} strokeWidth={2} /> Criar conta
          </Link>
        </div>
        <div className="auth-sep">
          <span>ou</span>
        </div>
        <GoogleLoginButton convite={code} />
      </>
    );
  }

  if (alreadyMember) {
    return (
      <>
        <AuthHeader title={`Você já está em “${household}”`} subtitle="Este convite é para uma família da qual você já faz parte." />
        <div className="auth-form">
          <Link href="/painel" className="auth-submit">
            <Check size={22} strokeWidth={2} /> Abrir o painel
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthHeader title={`Entrar em “${household}”?`} subtitle={`${who}, ${current.name.split(" ")[0]}.`} error={error} />
      {current.household && (
        <div className="invite-note">
          <p>
            Ao aceitar, você <strong>sai da família “{current.household}”</strong> e passa para “{household}”.
          </p>
          <p>
            Lá, você continua aparecendo como <strong>pessoa sem login</strong>, com tudo que já foi lançado: ninguém perde histórico nem dívidas.
          </p>
        </div>
      )}
      <div className="auth-form">
        <button
          type="button"
          className="auth-submit"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const r = await acceptInviteLoggedIn(code);
              if (r && !r.ok) setError(r.error);
            })
          }
        >
          <Check size={22} strokeWidth={2} /> {pending ? "Entrando…" : "Aceitar e entrar"}
        </button>
      </div>
      <p className="auth-bottom">
        <Link href="/painel">Agora não</Link>
      </p>
    </>
  );
}
