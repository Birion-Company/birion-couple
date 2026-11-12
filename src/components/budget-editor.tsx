"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBudget } from "@/app/actions/budget";
import { centsToInput, formatMoney } from "@/lib/money";
import { CategoryIcon } from "./ui";
import { toastResult } from "./toaster";

type Row = { id: string; name: string; color: string; icon: string | null; limitCents: number | null; spentCents: number };

const tone = (spent: number, limit: number) => (spent >= limit ? "over" : spent >= limit * 0.8 ? "near" : "ok");

/** Uma barra "gasto x limite" (verde até 80%, amarela perto, vermelha estourada). */
export function BudgetBar({ spent, limit }: { spent: number; limit: number }) {
  const pct = Math.min(100, Math.round((spent / limit) * 100));
  return (
    <div className="bud-bar" role="progressbar" aria-valuenow={Math.round((spent / limit) * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span className={tone(spent, limit)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BudgetEditor({ rows, currency }: { rows: Row[]; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.limitCents ? centsToInput(r.limitCents) : ""])));
  const save = (r: Row) =>
    start(async () => {
      const res = await saveBudget(r.id, values[r.id] ?? "");
      toastResult(res);
      if (res.ok) router.refresh();
    });
  return (
    <section className="card section" aria-labelledby="orcamento">
      <h2 id="orcamento">Orçamento do mês</h2>
      <p className="faint">
        Defina quanto você quer gastar por mês em cada categoria. <strong>Só a sua parte</strong> conta, e só você vê. Você recebe um aviso ao chegar
        em 80% e outro ao passar do limite. Deixe vazio para não ter limite.
      </p>
      <div className="rows bud-rows">
        {rows.map((r) => (
          <form
            key={r.id}
            className="row bud-row"
            onSubmit={(e) => {
              e.preventDefault();
              save(r);
            }}
          >
            <CategoryIcon icon={r.icon ?? undefined} color={r.color} size={30} />
            <div className="grow" style={{ minWidth: 0 }}>
              <p className="title">{r.name}</p>
              {r.limitCents ? (
                <>
                  <BudgetBar spent={r.spentCents} limit={r.limitCents} />
                  <p className={`sub bud-${tone(r.spentCents, r.limitCents)}`}>
                    {formatMoney(r.spentCents, currency)} de {formatMoney(r.limitCents, currency)} · {Math.round((r.spentCents / r.limitCents) * 100)}%
                  </p>
                </>
              ) : (
                <p className="sub">Gasto neste mês: {formatMoney(r.spentCents, currency)}</p>
              )}
            </div>
            <label className="bud-input">
              <span className="sr-only">Limite mensal de {r.name}</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder="Sem limite"
                value={values[r.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value.replace(/[^\d,.]/g, "") }))}
                onBlur={() => (values[r.id] ?? "") !== (r.limitCents ? centsToInput(r.limitCents) : "") && save(r)}
              />
            </label>
            <button className="btn small" disabled={pending} aria-label={`Salvar limite de ${r.name}`}>
              Salvar
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
