"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { createAccount, deleteAccount } from "@/app/actions/accounts";
import { brandOf, CARD_BRANDS } from "@/lib/card-brands";
import { LIMITS } from "@/lib/defaults";
import { formatMoney } from "@/lib/money";
import { CountMoney } from "./count-money";
import { toastResult } from "./toaster";
import { CardDot } from "./ui";

type Row = { id: string; name: string; openingCents: number; inCents: number; outCents: number; balanceCents: number };

const FALLBACK = "#85756A";

/**
 * Contas: o total em destaque e cada conta num cartão com a cor e a sigla do banco. O saldo
 * não se digita: ele vem das receitas lançadas na conta (botão "Receita") menos as despesas pagas por ela.
 */
export function AccountsEditor({ accounts, currency }: { accounts: Row[]; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
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
  const picked = brandOf(name);

  return (
    <section className="accounts" aria-labelledby="contas">
      <div className="accounts-total rise">
        <span className="st-label" id="contas">Total nas contas</span>
        <strong className={total < 0 ? "neg" : ""}>
          <CountMoney cents={total} currency={currency} duration={1200} />
        </strong>
        <span className="faint">{accounts.length === 0 ? "Cadastre onde o dinheiro está" : `${accounts.length} ${accounts.length === 1 ? "conta" : "contas"} · só você vê`}</span>
      </div>

      <div className="accounts-grid">
        {accounts.map((a, i) => {
          const color = brandOf(a.name)?.color ?? FALLBACK;
          return (
            <article key={a.id} className="account-card rise" style={{ "--i": i + 1, "--ac": color } as React.CSSProperties}>
              <div className="account-top">
                <CardDot name={a.name} color={color} size={40} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <h3>{a.name}</h3>
                  <p className="faint">{a.inCents > 0 || a.outCents > 0 ? "saldo pelos lançamentos" : "sem lançamentos ainda"}</p>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={pending}
                  aria-label={`Apagar conta ${a.name}`}
                  onClick={() => confirm(`Apagar a conta "${a.name}"? As receitas continuam nos lançamentos.`) && run(() => deleteAccount(a.id))}
                >
                  <Trash2 size={16} strokeWidth={1.7} />
                </button>
              </div>
              <p className={`account-balance ${a.balanceCents < 0 ? "neg" : ""}`} aria-label={formatMoney(a.balanceCents, currency)}>
                <CountMoney cents={a.balanceCents} currency={currency} />
              </p>
              <p className="faint account-flow">
                {a.openingCents !== 0 ? `começou com ${formatMoney(a.openingCents, currency)} · ` : ""}+ {formatMoney(a.inCents, currency)} entrou · − {formatMoney(a.outCents, currency)} saiu
              </p>
              <Link className="btn small account-income" href={`/transacoes/nova?tipo=receita&conta=${a.id}`}>
                <Plus size={14} /> Receita nesta conta
              </Link>
            </article>
          );
        })}

        {adding ? (
          <form
            className="account-card account-new"
            style={{ "--ac": picked?.color ?? FALLBACK } as React.CSSProperties}
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createAccount(name, balance), () => {
                setName("");
                setBalance("");
                setAdding(false);
              });
            }}
          >
            <div className="account-top">
              <CardDot name={name || "?"} color={picked?.color ?? FALLBACK} size={40} />
              <h3 className="grow">Nova conta</h3>
              <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setAdding(false)}>
                <X size={16} />
              </button>
            </div>
            <label className="field">
              <span>Nome</span>
              <input className="input" autoFocus list="bancos" value={name} maxLength={40} placeholder="Nubank, carteira…" onChange={(e) => setName(e.target.value)} />
              <datalist id="bancos">
                {CARD_BRANDS.filter((b) => b.name !== "Outro cartão").map((b) => (
                  <option key={b.name} value={b.name} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Já tinha na conta (só no começo)</span>
              <input className="input" inputMode="decimal" placeholder="1.000,00" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^\d,.-]/g, ""))} />
            </label>
            <button className="btn primary" disabled={pending || !name.trim()}>
              Criar conta
            </button>
          </form>
        ) : accounts.length >= LIMITS.accounts ? (
          <p className="faint account-help">Limite de {LIMITS.accounts} contas.</p>
        ) : (
          <button type="button" className="account-card account-add" onClick={() => setAdding(true)}>
            <span className="account-add-ico">
              <Plus size={22} />
            </span>
            <strong>Nova conta</strong>
            <span className="faint">{accounts.length} de {LIMITS.accounts} · banco, carteira, poupança</span>
          </button>
        )}
      </div>
      <p className="faint account-help">Para o saldo mudar, lance uma <strong>receita</strong> na conta (ou uma despesa pagando por ela). Ele entra em &quot;Minha posição&quot; no Início.</p>
    </section>
  );
}
