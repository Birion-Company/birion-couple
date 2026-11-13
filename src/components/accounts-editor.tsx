"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAccount, deleteAccount, setAccountBalance } from "@/app/actions/accounts";
import { centsToInput, formatMoney } from "@/lib/money";
import { toastResult } from "./toaster";

type Row = { id: string; name: string; balanceCents: number; updatedAt: string };

const asInput = (c: number) => (c < 0 ? "-" : "") + centsToInput(Math.abs(c));

export function AccountsEditor({ accounts, currency }: { accounts: Row[]; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.id, asInput(a.balanceCents)])));
  const run = (fn: () => Promise<{ ok: boolean }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      toastResult(res as never);
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  const total = accounts.reduce((a, c) => a + c.balanceCents, 0);
  return (
    <section className="card section" aria-labelledby="contas">
      <h2 id="contas">Contas</h2>
      <p className="faint">
        Cadastre suas contas (banco, carteira, poupança) e o saldo de cada uma. Mantenha o saldo em dia: ele é o &quot;quanto você tem agora&quot; da <strong>Minha posição</strong>
        no painel, junto com faturas e dívidas. Só você vê.
      </p>
      <div className="rows">
        {accounts.map((a) => (
          <form
            key={a.id}
            className="row bud-row"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => setAccountBalance(a.id, values[a.id] ?? ""));
            }}
          >
            <div className="grow" style={{ minWidth: 0 }}>
              <p className="title">{a.name}</p>
              <p className="sub">
                {formatMoney(a.balanceCents, currency)} · atualizado em {new Date(a.updatedAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <label className="bud-input">
              <span className="sr-only">Saldo de {a.name}</span>
              <input className="input" inputMode="decimal" value={values[a.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value.replace(/[^\d,.-]/g, "") }))} />
            </label>
            <button className="btn small" disabled={pending} aria-label={`Salvar saldo de ${a.name}`}>
              Salvar
            </button>
            <button type="button" className="btn small ghost" disabled={pending} aria-label={`Apagar conta ${a.name}`} onClick={() => confirm(`Apagar a conta "${a.name}"?`) && run(() => deleteAccount(a.id))}>
              Apagar
            </button>
          </form>
        ))}
        {accounts.length === 0 && <p className="faint">Nenhuma conta ainda.</p>}
      </div>
      {accounts.length > 0 && (
        <p className="sub">
          Total nas contas: <strong>{formatMoney(total, currency)}</strong>
        </p>
      )}
      <form
        className="goal-new"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createAccount(name, balance), () => {
            setName("");
            setBalance("");
          });
        }}
      >
        <h3>Nova conta</h3>
        <label className="field">
          <span>Nome</span>
          <input className="input" value={name} maxLength={40} placeholder="Nubank, carteira…" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Saldo agora</span>
          <input className="input" inputMode="decimal" placeholder="1.000,00" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^\d,.-]/g, ""))} />
        </label>
        <button className="btn" disabled={pending}>
          Criar conta
        </button>
      </form>
    </section>
  );
}
