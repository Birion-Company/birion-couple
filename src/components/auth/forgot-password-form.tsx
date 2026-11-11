"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, KeyRound, Lock, Mail, Send, User } from "lucide-react";
import { requestPasswordReset, resetPassword, verifyResetCode } from "@/app/actions/password-reset";
import { AuthHeader } from "./auth-header";
import { AuthInput } from "./auth-input";

type Step = "email" | "code" | "password";

/**
 * Esqueci minha senha, em 3 passos na mesma tela:
 * 1. e-mail → manda um código de 4 números; 2. código; 3. senha nova (duas vezes).
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [pending, start] = useTransition();

  const sendCode = (mail: string) =>
    start(async () => {
      setError(undefined);
      const r = await requestPasswordReset(mail);
      if (!r.ok) return setError(r.error);
      setEmail(mail.trim().toLowerCase());
      setNotice(r.message);
      setCode("");
      setStep("code");
    });

  const checkCode = () =>
    start(async () => {
      setError(undefined);
      const r = await verifyResetCode(email, code);
      if (!r.ok) return setError(r.error);
      setNotice(undefined);
      setStep("password");
    });

  const save = (form: FormData) =>
    start(async () => {
      setError(undefined);
      const r = await resetPassword(email, code, String(form.get("password") ?? ""), String(form.get("confirm") ?? ""));
      if (!r.ok) return setError(r.error);
      router.push("/entrar?senha=nova");
    });

  const titles: Record<Step, [string, string]> = {
    email: ["Esqueceu a senha?", "Digite o e-mail da sua conta. Vamos mandar um código de 4 números."],
    code: ["Digite o código", notice ?? `Mandamos um código de 4 números para ${email}.`],
    password: ["Crie uma senha nova", "Pelo menos 8 caracteres. Depois é só entrar com ela."],
  };

  return (
    <>
      <AuthHeader title={titles[step][0]} subtitle={titles[step][1]} error={error} />
      <ol className="reset-steps" aria-label="Passos">
        {(["email", "code", "password"] as Step[]).map((s, i) => (
          <li key={s} className={s === step ? "on" : (["email", "code", "password"] as Step[]).indexOf(step) > i ? "done" : ""}>
            {i + 1}
          </li>
        ))}
      </ol>

      {step === "email" && (
        <form className="auth-form" action={(f) => sendCode(String(f.get("email") ?? ""))}>
          <AuthInput label="Seu e-mail" name="email" type="email" autoComplete="email" defaultValue={email} icon={User} />
          <button className="auth-submit" disabled={pending}>
            <Send size={22} strokeWidth={2} /> {pending ? "Enviando…" : "Mandar código"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            checkCode();
          }}
        >
          <div className="auth-field">
            <label htmlFor="reset-code" className="sr-only">
              Código de 4 números
            </label>
            <input
              id="reset-code"
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
            <KeyRound size={22} strokeWidth={2} /> {pending ? "Conferindo…" : "Continuar"}
          </button>
          <p className="reset-again">
            Não chegou?{" "}
            <button type="button" className="reset-link" disabled={pending} onClick={() => sendCode(email)}>
              Mandar outro código
            </button>{" "}
            ·{" "}
            <button
              type="button"
              className="reset-link"
              onClick={() => {
                setStep("email");
                setError(undefined);
              }}
            >
              Trocar e-mail
            </button>
          </p>
        </form>
      )}

      {step === "password" && (
        <form className="auth-form" action={save}>
          <AuthInput label="Senha nova" name="password" type="password" autoComplete="new-password" icon={Lock} />
          <AuthInput label="Repita a senha nova" name="confirm" type="password" autoComplete="new-password" icon={Lock} />
          <button className="auth-submit" disabled={pending}>
            <Mail size={22} strokeWidth={2} /> {pending ? "Salvando…" : "Salvar senha nova"}
          </button>
        </form>
      )}

      <p className="auth-bottom">
        <Link href="/entrar">
          <ArrowLeft size={15} strokeWidth={2.2} style={{ verticalAlign: -2 }} /> Voltar para entrar
        </Link>
      </p>
    </>
  );
}
