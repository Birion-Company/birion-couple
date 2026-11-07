"use client";

import Link from "next/link";
import { useActionState, useId, useState, type ComponentType } from "react";
import { Eye, EyeOff, Home, Lock, LogIn, Mail, User, UserPlus } from "lucide-react";
import { acceptInvite, login, signup, type FormState } from "@/app/actions/auth";

type IconType = ComponentType<{ size?: number; strokeWidth?: number }>;

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  autoComplete,
  hint,
  icon: Icon,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  autoComplete?: string;
  hint?: string;
  icon: IconType;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="field">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="icon-input">
        <span className="icon-input-icon" aria-hidden>
          <Icon size={19} strokeWidth={1.7} />
        </span>
        <input
          id={id}
          className="input"
          name={name}
          type={isPassword && show ? "text" : type}
          placeholder={label}
          defaultValue={defaultValue}
          autoComplete={autoComplete}
          aria-describedby={hint ? `${id}-hint` : undefined}
          required
        />
        {isPassword && (
          <button
            type="button"
            className="icon-input-toggle"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Esconder senha" : "Mostrar senha"}
            aria-pressed={show}
          >
            {show ? <Eye size={19} strokeWidth={1.7} /> : <EyeOff size={19} strokeWidth={1.7} />}
          </button>
        )}
      </div>
      {hint && (
        <span id={`${id}-hint`} className="faint">
          {hint}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div className="auth-divider">
      <span>ou</span>
    </div>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  return (
    <>
      <form action={action} className="form">
        {state?.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
        <Field label="Seu e-mail" name="email" type="email" autoComplete="email" defaultValue={state?.fields?.email} icon={User} />
        <Field label="Sua senha" name="password" type="password" autoComplete="current-password" icon={Lock} />
        <button className="btn primary block auth-submit" disabled={pending}>
          <LogIn size={20} strokeWidth={1.8} /> {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <Divider />
      <Link href="/criar-conta" className="btn block auth-secondary">
        <UserPlus size={18} strokeWidth={1.7} /> Criar a conta da família
      </Link>
      <p className="auth-foot">
        Recebeu um convite? Abra o link que te enviaram.
      </p>
    </>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, undefined);
  return (
    <>
      <form action={action} className="form">
        {state?.error && (
          <p className="error" role="alert">
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
        <button className="btn primary block auth-submit" disabled={pending}>
          <UserPlus size={20} strokeWidth={1.8} /> {pending ? "Criando…" : "Criar conta"}
        </button>
      </form>
      <p className="auth-foot">
        Já tem uma conta? <Link href="/entrar">Entrar</Link>
      </p>
    </>
  );
}

export function InviteForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvite, undefined);
  return (
    <form action={action} className="form">
      <input type="hidden" name="code" value={code} />
      {state?.error && (
        <p className="error" role="alert">
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
      <button className="btn primary block auth-submit" disabled={pending}>
        <LogIn size={20} strokeWidth={1.8} /> {pending ? "Entrando…" : "Entrar na família"}
      </button>
    </form>
  );
}
