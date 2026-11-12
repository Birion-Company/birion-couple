"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { confirmEmail, resendVerifyCode } from "@/app/actions/email-verify";
import { logout } from "@/app/actions/auth";
import { AuthHeader } from "./auth-header";

/** Confirmar o e-mail: código de 4 números, "mandar outro" e sair (para entrar com outro e-mail). */
export function VerifyEmailForm({ email, convite, sendFailed }: { email: string; convite?: string; sendFailed?: boolean }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(sendFailed ? "Não conseguimos mandar o código. Toque em “Mandar outro código”." : undefined);
  const [notice, setNotice] = useState<string | undefined>();
  const [pending, start] = useTransition();

  const check = () =>
    start(async () => {
      setError(undefined);
      const r = await confirmEmail(code, convite);
      if (r && !r.ok) setError(r.error);
    });
  const resend = () =>
    start(async () => {
      setError(undefined);
      const r = await resendVerifyCode();
      if (!r) return;
      if (r.ok) {
        setNotice(r.message);
        setCode("");
      } else setError(r.error);
    });

  return (
    <>
      <AuthHeader
        title="Confirme seu e-mail"
        subtitle={notice ?? `Mandamos um código de 4 números para ${email}. Confira também o spam.`}
        error={error}
      />
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <div className="auth-field">
          <label htmlFor="verify-code" className="sr-only">
            Código de 4 números
          </label>
          <input
            id="verify-code"
            className="reset-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{4}"
            maxLength={4}
            autoFocus
            placeholder="••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </div>
        <button className="auth-submit" disabled={pending || code.length !== 4}>
          <KeyRound size={22} strokeWidth={2} /> {pending ? "Conferindo…" : "Confirmar"}
        </button>
        <p className="reset-again">
          Não chegou?{" "}
          <button type="button" className="reset-link" disabled={pending} onClick={resend}>
            Mandar outro código
          </button>{" "}
          ·{" "}
          <button type="button" className="reset-link" disabled={pending} onClick={() => start(() => logout())}>
            Usar outro e-mail
          </button>
        </p>
      </form>
    </>
  );
}
