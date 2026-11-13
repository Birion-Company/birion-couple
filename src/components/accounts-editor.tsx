"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { createAccount, deleteAccount, setAccountBalance } from "@/app/actions/accounts";
import { brandOf, CARD_BRANDS } from "@/lib/card-brands";
import { centsToInput, formatMoney } from "@/lib/money";
import { CountMoney } from "./count-money";
import { toastResult } from "./toaster";
import { CardDot } from "./ui";

type Row = { id: string; name: string; balanceCents: number; updatedAt: string };

const asInput = (c: number) => (c < 0 ? "-" : "") + centsToInput(Math.abs(c));
const FALLBACK = "#85756A";

/**
 * Contas: o total em destaque e cada conta num cartão com a cor e a sigla do banco. O saldo se edita ali mesmo
 * (toque no lápis) e a conta nova entra pelo cartão tracejado, sugerindo os bancos conhecidos.
 */
export function AccountsEditor({ accounts, currency }: { accounts: Row[]; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
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
          const isEditing = editing === a.id;
          return (
            <article key={a.id} className="account-card rise" style={{ "--i": i + 1, "--ac": color } as React.CSSProperties}>
              <div className="account-top">
                <CardDot name={a.name} color={color} size={40} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <h3>{a.name}</h3>
                  <p className="faint">atualizado em {new Date(a.updatedAt).toLocaleDateString("pt-BR")}</p>
                </div>
                {!isEditing && (
                  <button type="button" className="icon-btn" aria-label={`Editar saldo de ${a.name}`} onClick={() => setEditing(a.id)}>
                    <Pencil size={16} strokeWidth={1.7} />
                  </button>
                )}
              </div>
              {isEditing ? (
                <form
                  className="account-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => setAccountBalance(a.id, values[a.id] ?? ""), () => setEditing(null));
                  }}
                >
                  <label className="bud-input">
                    <span className="sr-only">Saldo de {a.name}</span>
                    <input className="input" autoFocus inputMode="decimal" value={values[a.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value.replace(/[^\d,.-]/g, "") }))} />
                  </label>
                  <button className="btn primary small" disabled={pending} aria-label={`Salvar saldo de ${a.name}`}>
                    <Check size={15} /> Salvar
                  </button>
                  <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setEditing(null)}>
                    <X size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={pending}
                    aria-label={`Apagar conta ${a.name}`}
                    onClick={() => confirm(`Apagar a conta "${a.name}"?`) && run(() => deleteAccount(a.id), () => setEditing(null))}
                  >
                    <Trash2 size={16} strokeWidth={1.7} />
                  </button>
                </form>
              ) : (
                <p className={`account-balance ${a.balanceCents < 0 ? "neg" : ""}`} aria-label={formatMoney(a.balanceCents, currency)}>
                  <CountMoney cents={a.balanceCents} currency={currency} />
                </p>
              )}
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
              <span>Saldo agora</span>
              <input className="input" inputMode="decimal" placeholder="1.000,00" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^\d,.-]/g, ""))} />
            </label>
            <button className="btn primary" disabled={pending || !name.trim()}>
              Criar conta
            </button>
          </form>
        ) : (
          <button type="button" className="account-card account-add" onClick={() => setAdding(true)}>
            <span className="account-add-ico">
              <Plus size={22} />
            </span>
            <strong>Nova conta</strong>
            <span className="faint">banco, carteira, poupança</span>
          </button>
        )}
      </div>
      <p className="faint account-help">O saldo entra em &quot;Minha posição&quot; no Início, junto com faturas e dívidas.</p>
    </section>
  );
}
