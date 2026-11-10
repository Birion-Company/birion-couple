"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { makeSeriesEndless, reshapeSeries } from "@/app/actions/transactions";
import { monthLabel, shortDate } from "@/lib/cards";
import { centsToInput, formatMoney, parseAmountToCents } from "@/lib/money";
import { firstDateOf, isReal, planSeries, type SeriesItem } from "@/lib/series-plan";
import { toastResult } from "./toaster";

/**
 * "Parcelamento": muda o número de parcelas, a data da 1ª e o valor de cada uma depois de criada.
 * Mostra como vai ficar antes de aplicar; o que veio do extrato fica como está.
 */
export function SeriesEditor({ txId, items, total: savedTotal, currency, monthly = false }: { txId: string; items: SeriesItem[]; total: number; currency: string; monthly?: boolean }) {
  // "Até quando": um número de parcelas (ou meses) ou todo mês, sem data para acabar.
  const [endless, setEndless] = useState(false);
  const unit = monthly ? "meses" : "parcelas";
  const router = useRouter();
  const [pending, start] = useTransition();
  const sorted = [...items].sort((a, b) => a.index - b.index);
  const current = sorted.find((x) => x.id === txId);
  const [total, setTotal] = useState(String(savedTotal));
  const [firstDate, setFirstDate] = useState(firstDateOf(items) ?? sorted[0]?.date ?? "");
  const [amount, setAmount] = useState(centsToInput(current?.amountCents ?? sorted[sorted.length - 1]?.amountCents ?? 0));
  const cents = parseAmountToCents(amount, ",");
  const plan = useMemo(() => planSeries(items, { total: Number(total) || 0, firstDate, amountCents: cents && cents > 0 ? cents : null }), [items, total, firstDate, cents]);
  const changes = plan.steps.filter((s) => s.action !== "keep").length + plan.remove.length;
  const realCount = items.filter((x) => isReal(x.source)).length;

  return (
    <details className="card section series-editor">
      <summary>
        <Layers size={16} strokeWidth={1.8} aria-hidden />
        <span className="grow">
          <strong>{monthly ? "Repetição" : "Parcelamento"}</strong>
          <span className="faint"> · {savedTotal} {unit} a partir de {monthLabel((firstDateOf(items) ?? "").slice(0, 7))}</span>
        </span>
        <span className="faint">mudar</span>
        <ChevronDown size={16} strokeWidth={1.8} className="impact-chevron" aria-hidden />
      </summary>
      <div className="series-editor-body">
        <div className="segmented" role="group" aria-label="Até quando">
          <button type="button" aria-pressed={!endless} onClick={() => setEndless(false)}>
            Número de {unit}
          </button>
          <button type="button" aria-pressed={endless} onClick={() => setEndless(true)}>
            Todo mês, sem fim
          </button>
        </div>
        {endless ? (
          <>
            <p className="faint">
              Repete todo mês, sem fim, com {formatMoney(sorted[sorted.length - 1]?.amountCents ?? 0, currency)}.
            </p>
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn primary small"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await makeSeriesEndless(txId);
                    toastResult(r);
                    if (r.ok) {
                      router.refresh();
                      window.dispatchEvent(new Event("bf:tx-changed"));
                    }
                  })
                }
              >
                {pending ? "Mudando…" : "Repetir todo mês, sem fim"}
              </button>
            </div>
          </>
        ) : (
        <>
        <div className="field-row">
          <label className="field">
            <span>Número de {unit}</span>
            <input className="input" type="number" min={2} max={48} value={total} onChange={(e) => setTotal(e.target.value)} />
          </label>
          <label className="field">
            <span>{monthly ? "Data do 1º mês" : "Data da 1ª parcela"}</span>
            <input className="input" type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
          </label>
          <label className="field">
            <span>{monthly ? "Valor de cada mês" : "Valor de cada parcela"}</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ""))} />
          </label>
        </div>
        {realCount > 0 && (
          <p className="faint">
            {realCount === 1 ? "1 parcela veio" : `${realCount} parcelas vieram`} do extrato: {realCount === 1 ? "fica" : "ficam"} com a data e o valor reais.
          </p>
        )}
        {plan.error ? (
          <p className="neg">{plan.error}</p>
        ) : (
          <ol className="series-plan">
            {plan.steps.map((s) => (
              <li key={s.index} className={s.action}>
                <span className="series-plan-n">{s.index}/{Number(total)}</span>
                <span>{shortDate(s.date)}</span>
                <span>{formatMoney(s.amountCents, currency)}</span>
                <span className="faint">
                  {s.action === "create" ? "nova" : s.action === "update" ? "ajustada" : s.real ? "do extrato" : ""}
                </span>
              </li>
            ))}
            {plan.remove.map((r) => (
              <li key={`rm-${r.index}`} className="remove">
                <span className="series-plan-n">{r.index}</span>
                <span>{shortDate(r.date)}</span>
                <span />
                <span>apagada</span>
              </li>
            ))}
          </ol>
        )}
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn primary small"
            disabled={pending || !!plan.error || changes === 0}
            onClick={() =>
              start(async () => {
                const r = await reshapeSeries(txId, { total: Number(total), firstDate, amountCents: cents && cents > 0 ? cents : null });
                toastResult(r);
                if (r.ok) {
                      router.refresh();
                      window.dispatchEvent(new Event("bf:tx-changed"));
                    }
              })
            }
          >
            {changes === 0 ? "Nada para mudar" : pending ? "Atualizando…" : `Atualizar ${unit} (${changes} ${changes === 1 ? "mudança" : "mudanças"})`}
          </button>
        </div>
        </>
        )}
      </div>
    </details>
  );
}

