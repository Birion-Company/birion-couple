"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Hourglass } from "lucide-react";
import { setReceived } from "@/app/actions/transactions";
import { formatMoney } from "@/lib/money";
import { toastResult } from "./toaster";
import { PayButton } from "./debt-payments";

/** Parcela de dívida a seu favor (ex.: Teagar · Notebook 1/10), com o que ainda falta. */
export type DebtDue = { txId: string; date: string; description: string; personId: string; leftCents: number; pending: boolean; series: string };

type Item = { id: string; date: string; description: string; amountCents: number; seriesIndex: number | null; seriesTotal: number | null; seriesKind: string | null };

/**
 * "A receber" no painel: receitas que ainda não caíram na conta. O app não supõe que você recebeu:
 * só conta nas entradas depois do "Recebi". Atrasadas (data já passou) aparecem em destaque.
 */
export function AwaitingIncome({
  items,
  debts = [],
  names = {},
  today,
  currency,
}: {
  items: Item[];
  /** Dívidas a seu favor que já venceram ou vencem no mês (também é dinheiro a receber). */
  debts?: DebtDue[];
  names?: Record<string, string>;
  today: string;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (items.length === 0 && debts.length === 0) return null;
  const late = [...items, ...debts].filter((x) => x.date < today);
  const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const daysLate = (iso: string) => Math.round((Date.parse(today) - Date.parse(iso)) / 86400000);
  return (
    <section className="card section awaiting" aria-labelledby="a-receber">
      <div className="card-head">
        <h2 id="a-receber">
          <Hourglass size={17} strokeWidth={1.9} aria-hidden /> A receber
        </h2>
        <span className="faint">{late.length ? `${late.length} atrasad${late.length === 1 ? "o" : "os"}` : "você recebeu?"}</span>
      </div>
      <p className="faint awaiting-help">Receitas e dívidas a seu favor. Só conta depois que você confirmar que recebeu.</p>
      <div className="rows">
        {debts.map((x) => {
          const isLate = x.date < today;
          return (
            <div key={x.txId + x.personId} className={`row awaiting-row ${isLate ? "late" : ""}`}>
              <Link href={`/transacoes/${x.txId}`} className="grow" style={{ minWidth: 0 }}>
                <span className="title">
                  {names[x.personId] ?? "Alguém"} · {x.description}
                  {x.series && <span className="tx-series">{x.series}</span>}
                </span>
                <span className="sub" style={{ display: "block" }}>
                  Dívida · {isLate ? `venceu ${day(x.date)} · ${daysLate(x.date)} dia${daysLate(x.date) === 1 ? "" : "s"} de atraso` : x.date === today ? "vence hoje" : `vence ${day(x.date)}`}
                  {x.pending ? " · pagamento esperando confirmação" : ""}
                </span>
              </Link>
              <strong className="num awaiting-value">{formatMoney(x.leftCents, currency)}</strong>
              {!x.pending && <PayButton txId={x.txId} participantId={x.personId} owedCents={x.leftCents} currency={currency} label="Recebi" />}
            </div>
          );
        })}
        {items.map((x) => {
          const isLate = x.date < today;
          return (
            <div key={x.id} className={`row awaiting-row ${isLate ? "late" : ""}`}>
              <Link href={`/transacoes/${x.id}`} className="grow" style={{ minWidth: 0 }}>
                <span className="title">
                  {x.description}
                  {x.seriesKind === "monthly" ? <span className="tx-series">todo mês</span> : x.seriesTotal ? <span className="tx-series">{x.seriesIndex}/{x.seriesTotal}</span> : null}
                </span>
                <span className="sub" style={{ display: "block" }}>
                  {isLate ? `Era para ${day(x.date)} · ${daysLate(x.date)} dia${daysLate(x.date) === 1 ? "" : "s"} de atraso` : x.date === today ? "Hoje" : `Dia ${day(x.date)}`}
                </span>
              </Link>
              <strong className="num awaiting-value">{formatMoney(x.amountCents, currency)}</strong>
              <button
                type="button"
                className="btn small primary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await setReceived(x.id, true);
                    toastResult(r);
                    if (r.ok) router.refresh();
                  })
                }
              >
                <Check size={14} strokeWidth={2.4} /> Recebi
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
