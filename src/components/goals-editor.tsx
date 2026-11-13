"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { createGoal, deleteGoal, saveToGoal } from "@/app/actions/goals";
import { LIMITS } from "@/lib/defaults";
import { goalPlan } from "@/lib/goals";
import { formatMoney } from "@/lib/money";
import { CountMoney } from "./count-money";
import { MonthPicker } from "./month-picker";
import { toastResult } from "./toaster";

export type GoalRow = { id: string; name: string; targetCents: number; savedCents: number; targetMonth: string };

const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const addMonths = (m: string, n: number) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Anel de progresso da meta. */
function Ring({ pct, done, late }: { pct: number; done: boolean; late: boolean }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`goal-ring ${done ? "ok" : late ? "over" : ""}`} width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`${pct}% guardado`}>
      <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" className="track" />
      <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="bar" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 38 38)" />
      <text x="38" y="43" textAnchor="middle" className="pct">
        {pct}%
      </text>
    </svg>
  );
}

export function GoalsEditor({ goals, currency, nowMonth }: { goals: GoalRow[]; currency: string; nowMonth: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState("");
  const [add, setAdd] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<{ ok: boolean }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      toastResult(res as never);
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  const saved = goals.reduce((a, g) => a + g.savedCents, 0);
  const target = goals.reduce((a, g) => a + g.targetCents, 0);
  const presets: [string, number][] = [["3 meses", 3], ["6 meses", 6], ["1 ano", 12]];

  return (
    <section className="goals" aria-labelledby="metas">
      <div className="accounts-total rise">
        <span className="st-label" id="metas">Guardado nas metas</span>
        <strong>
          <CountMoney cents={saved} currency={currency} duration={1200} />
        </strong>
        <span className="faint">{goals.length === 0 ? "Comece com uma meta: viagem, reserva, casa…" : `de ${formatMoney(target, currency)} · ${goals.length} ${goals.length === 1 ? "meta" : "metas"}`}</span>
      </div>

      <div className="accounts-grid">
        {goals.map((g, i) => {
          const p = goalPlan(g.targetCents, g.savedCents, g.targetMonth, nowMonth);
          return (
            <article key={g.id} className="account-card goal-card rise" style={{ "--i": i + 1 } as React.CSSProperties}>
              <div className="account-top">
                <Ring pct={p.pct} done={p.done} late={p.late} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <h3>{g.name}</h3>
                  <p className="faint">até {monthLabel(g.targetMonth)}</p>
                </div>
                <button type="button" className="icon-btn" disabled={pending} aria-label={`Apagar meta ${g.name}`} onClick={() => confirm(`Apagar a meta "${g.name}"?`) && run(() => deleteGoal(g.id))}>
                  <Trash2 size={16} strokeWidth={1.7} />
                </button>
              </div>
              <p className="goal-nums">
                <strong>{formatMoney(g.savedCents, currency)}</strong> <span className="faint">de {formatMoney(g.targetCents, currency)}</span>
              </p>
              <p className={`goal-plan ${p.done ? "pos" : p.late ? "neg" : ""}`}>
                {p.done
                  ? "Meta batida! 🎉"
                  : p.late
                    ? `Prazo vencido · faltam ${formatMoney(p.remainingCents, currency)}`
                    : `Guardar ${formatMoney(p.perMonthCents, currency)}/mês por ${p.monthsLeft} ${p.monthsLeft === 1 ? "mês" : "meses"}`}
              </p>
              <form
                className="goal-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => saveToGoal(g.id, add[g.id] ?? ""), () => setAdd((v) => ({ ...v, [g.id]: "" })));
                }}
              >
                <label>
                  <span className="sr-only">Valor para guardar em {g.name}</span>
                  <input className="input" inputMode="decimal" placeholder="Valor" value={add[g.id] ?? ""} onChange={(e) => setAdd((v) => ({ ...v, [g.id]: e.target.value.replace(/[^\d,.]/g, "") }))} />
                </label>
                <button className="btn primary small" disabled={pending}>
                  Guardei
                </button>
                <button type="button" className="btn small ghost" disabled={pending} onClick={() => run(() => saveToGoal(g.id, add[g.id] ?? "", -1), () => setAdd((v) => ({ ...v, [g.id]: "" })))}>
                  Retirei
                </button>
              </form>
            </article>
          );
        })}

        {adding ? (
          <form
            className="account-card account-new goal-new-card"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createGoal(name, amount, month), () => {
                setName("");
                setAmount("");
                setMonth("");
                setAdding(false);
              });
            }}
          >
            <div className="account-top">
              <h3 className="grow">Nova meta</h3>
              <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setAdding(false)}>
                <X size={16} />
              </button>
            </div>
            <label className="field">
              <span>Nome</span>
              <input className="input" autoFocus value={name} maxLength={60} placeholder="Viagem, reserva…" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Quanto quer juntar</span>
              <input className="input" inputMode="decimal" placeholder="1.200,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ""))} />
            </label>
            <div className="field">
              <span>Até qual mês {month && <strong>· {monthLabel(month)}</strong>}</span>
              <div className="goal-presets">
                {presets.map(([label, n]) => (
                  <button key={label} type="button" className={`chip${month === addMonths(nowMonth, n) ? " on" : ""}`} onClick={() => setMonth(addMonths(nowMonth, n))}>
                    {label}
                  </button>
                ))}
              </div>
              <MonthPicker value={month} onChange={setMonth} min={nowMonth} label="Mês final da meta" />
            </div>
            <button className="btn primary" disabled={pending || !name.trim() || !amount.trim() || !month}>
              Criar meta
            </button>
          </form>
        ) : goals.length >= LIMITS.goals ? (
          <p className="faint account-help">Limite de {LIMITS.goals} metas.</p>
        ) : (
          <button type="button" className="account-card account-add" onClick={() => setAdding(true)}>
            <span className="account-add-ico">
              <Plus size={22} />
            </span>
            <strong>Nova meta</strong>
            <span className="faint">{goals.length} de {LIMITS.goals} · quanto e até quando</span>
          </button>
        )}
      </div>
    </section>
  );
}
