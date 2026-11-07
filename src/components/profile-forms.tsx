"use client";

import { useState, useTransition } from "react";
import { changePassword, updateProfile } from "@/app/actions/profile";
import { toastResult } from "./toaster";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [pending, start] = useTransition();
  const [n, setN] = useState(name);
  const [e, setE] = useState(email);
  const changed = n.trim() !== name || e.trim().toLowerCase() !== email;
  return (
    <form
      className="card form"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => toastResult(await updateProfile({ name: n, email: e })));
      }}
    >
      <h2>Dados pessoais</h2>
      <label className="field">
        <span>Nome</span>
        <input className="input" value={n} onChange={(ev) => setN(ev.target.value)} maxLength={60} autoComplete="name" required />
      </label>
      <div className="field">
        <label htmlFor="perfil-email">E-mail</label>
        <input
          id="perfil-email"
          className="input"
          type="email"
          value={e}
          onChange={(ev) => setE(ev.target.value)}
          autoComplete="email"
          aria-describedby="perfil-email-hint"
          required
        />
        <span id="perfil-email-hint" className="faint">É o e-mail que você usa para entrar.</span>
      </div>
      <div className="actions" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" disabled={pending || !changed}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [pending, start] = useTransition();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const set = (k: keyof typeof v) => (ev: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: ev.target.value }));
  return (
    <form
      className="card form"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => {
          const r = await changePassword(v);
          toastResult(r);
          if (r.ok) setV({ current: "", next: "", confirm: "" });
        });
      }}
    >
      <h2>Senha</h2>
      <label className="field">
        <span>Senha atual</span>
        <input className="input" type="password" value={v.current} onChange={set("current")} autoComplete="current-password" required />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Nova senha</span>
          <input className="input" type="password" value={v.next} onChange={set("next")} autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          <span>Repita a nova senha</span>
          <input className="input" type="password" value={v.confirm} onChange={set("confirm")} autoComplete="new-password" minLength={8} required />
        </label>
      </div>
      <div className="actions" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" disabled={pending}>
          {pending ? "Alterando…" : "Alterar senha"}
        </button>
      </div>
    </form>
  );
}
