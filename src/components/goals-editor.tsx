"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGoal, deleteGoal, saveToGoal } from "@/app/actions/goals";
import { goalPlan } from "@/lib/goals";
import { formatMoney } from "@/lib/money";
import { toastResult } from "./toaster";

export type GoalRow = { id: string; name: string; targetCents: number; savedCents: number; targetMonth: string };

const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export function GoalsEditor({ goals, currency, nowMonth }: { goals: GoalRow[]; currency: string; nowMonth: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
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
  return (
    <section className="card section" aria-labelledby="metas">
      <h2 id="metas">Metas de economia</h2>
      <p className="faint">Defina quanto quer juntar e até quando. Registre o que guardou e veja quanto falta e quanto guardar por mês. Só você vê.</p>
      <div className="rows">
        {goals.map((g) => {
          const p = goalPlan(g.targetCents, g.savedCents, g.targetMonth, nowMonth);
          return (
            <div key={g.id} className="row goal-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <p className="title">{g.name}</p>
                <div className="bud-bar" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}>
                  <span className={p.done ? "ok" : p.late ? "over" : "near"} style={{ width: `${p.pct}%` }} />
                </div>
                <p className="sub">
                  {formatMoney(g.savedCents, currency)} de {formatMoney(g.targetCents, currency)} · {p.pct}% · até {monthLabel(g.targetMonth)}
                </p>
                <p className="sub">
                  {p.done
                    ? "Meta batida! 🎉"
                    : `Falta ${formatMoney(p.remainingCents, currency)} · guardar ${formatMoney(p.perMonthCents, currency)}/mês ${p.late ? "(prazo vencido)" : `por ${p.monthsLeft} ${p.monthsLeft === 1 ? "mês" : "meses"}`}`}
                </p>
              </div>
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
                <button className="btn small" disabled={pending}>
                  Guardei
                </button>
                <button type="button" className="btn small ghost" disabled={pending} onClick={() => run(() => saveToGoal(g.id, add[g.id] ?? "", -1), () => setAdd((v) => ({ ...v, [g.id]: "" })))}>
                  Retirei
                </button>
                <button
                  type="button"
                  className="btn small ghost"
                  disabled={pending}
                  aria-label={`Apagar meta ${g.name}`}
                  onClick={() => confirm(`Apagar a meta "${g.name}"?`) && run(() => deleteGoal(g.id))}
                >
                  Apagar
                </button>
              </form>
            </div>
          );
        })}
        {goals.length === 0 && <p className="faint">Nenhuma meta ainda.</p>}
      </div>
      <form
        className="goal-new"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createGoal(name, amount, month), () => {
            setName("");
            setAmount("");
            setMonth("");
          });
        }}
      >
        <h3>Nova meta</h3>
        <label className="field">
          <span>Nome</span>
          <input className="input" value={name} maxLength={60} placeholder="Viagem, reserva…" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Quanto quer juntar</span>
          <input className="input" inputMode="decimal" placeholder="1.200,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ""))} />
        </label>
        <label className="field">
          <span>Até qual mês</span>
          <input className="input" type="month" min={nowMonth} value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button className="btn" disabled={pending}>
          Criar meta
        </button>
      </form>
    </section>
  );
}
