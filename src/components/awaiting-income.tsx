"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronDown, Hourglass } from "lucide-react";
import { setReceived } from "@/app/actions/transactions";
import { formatMoney } from "@/lib/money";
import { toastResult } from "./toaster";
import { PayButton } from "./debt-payments";

/** Parcela de dívida a seu favor (ex.: Teagar · Notebook 1/10), com o que ainda falta. */
export type DebtDue = {
  txId: string;
  date: string;
  description: string;
  personId: string;
  leftCents: number;
  pending: boolean;
  series: string;
};

type Item = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  seriesIndex: number | null;
  seriesTotal: number | null;
  seriesKind: string | null;
};

/** Quantos aparecem sem abrir: o quadro não cresce sem fim conforme a pessoa lança mais coisas. */
const SHOWN = 3;

/**
 * "A receber" no painel: receitas que ainda não caíram na conta e dívidas a seu favor. O app não
 * supõe que você recebeu: só conta depois do "Recebi". Uma lista só, do mais atrasado para o mais
 * novo; aparecem os primeiros e o resto abre em "Ver mais".
 */
export function AwaitingIncome({
  items,
  debts = [],
  names = {},
  today,
  currency,
  month,
}: {
  /** Mês visto no painel (para o link "ver todas" abrir no mesmo mês). */
  month: string;
  items: Item[];
  /** Dívidas a seu favor que já venceram ou vencem no mês (também é dinheiro a receber). */
  debts?: DebtDue[];
  names?: Record<string, string>;
  today: string;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [all, setAll] = useState(false);
  if (items.length === 0 && debts.length === 0) return null;

  const list = [
    ...debts.map((x) => ({
      key: `d-${x.txId}-${x.personId}`,
      date: x.date,
      debt: x,
      income: null,
    })),
    ...items.map((x) => ({
      key: `i-${x.id}`,
      date: x.date,
      debt: null,
      income: x,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const visible = all ? list : list.slice(0, SHOWN);
  const hidden = list.length - visible.length;
  const total =
    debts.reduce((a, x) => a + x.leftCents, 0) +
    items.reduce((a, x) => a + x.amountCents, 0);
  const late = list.filter((x) => x.date < today).length;
  const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const daysLate = (iso: string) =>
    Math.round((Date.parse(today) - Date.parse(iso)) / 86400000);
  const lateText = (iso: string) =>
    `${daysLate(iso)} dia${daysLate(iso) === 1 ? "" : "s"} de atraso`;

  const received = (id: string) =>
    start(async () => {
      const r = await setReceived(id, true);
      toastResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <section
      className="card section awaiting"
      aria-labelledby="a-receber"
      data-tour="dash-awaiting"
    >
      <div className="card-head">
        <h2 id="a-receber">
          <Hourglass size={17} strokeWidth={1.9} aria-hidden /> A receber
        </h2>
        {/* Total à vista no canto, com quantos estão atrasados. */}
        <span className="awaiting-sum">
          <strong className="num">{formatMoney(total, currency)}</strong>
          {late ? (
            <span className="neg">
              {" "}
              · {late} atrasad{late === 1 ? "o" : "os"}
            </span>
          ) : null}
        </span>
      </div>
      {/* O que este quadro mostra (só o urgente) e quando conta como recebido. */}
      <p className="awaiting-help">
        Aqui aparece <strong>só o mais importante</strong>: o que já venceu ou
        vence neste mês, do mais atrasado para o mais novo
        {list.length > SHOWN
          ? ` (os ${SHOWN} primeiros de ${list.length}; “Ver mais” abre o resto)`
          : ""}
        . Só conta como recebido depois que você toca em <strong>Recebi</strong>
        .
      </p>
      <div className="rows">
        {visible.map(({ key, debt: x, income: y }) => {
          if (x) {
            const isLate = x.date < today;
            return (
              <div
                key={key}
                className={`row awaiting-row ${isLate ? "late" : ""}`}
              >
                <Link
                  href={`/transacoes/${x.txId}`}
                  className="grow"
                  style={{ minWidth: 0 }}
                >
                  <span className="title">
                    {names[x.personId] ?? "Alguém"} · {x.description}
                    {x.series && <span className="tx-series">{x.series}</span>}
                  </span>
                  <span className="sub" style={{ display: "block" }}>
                    Dívida ·{" "}
                    {isLate
                      ? `venceu ${day(x.date)} · ${lateText(x.date)}`
                      : x.date === today
                        ? "vence hoje"
                        : `vence ${day(x.date)}`}
                    {x.pending ? " · pagamento esperando confirmação" : ""}
                  </span>
                </Link>
                <strong className="num awaiting-value">
                  {formatMoney(x.leftCents, currency)}
                </strong>
                {!x.pending && (
                  <PayButton
                    txId={x.txId}
                    participantId={x.personId}
                    owedCents={x.leftCents}
                    currency={currency}
                    label="Recebi"
                  />
                )}
              </div>
            );
          }
          const isLate = y!.date < today;
          return (
            <div
              key={key}
              className={`row awaiting-row ${isLate ? "late" : ""}`}
            >
              <Link
                href={`/transacoes/${y!.id}`}
                className="grow"
                style={{ minWidth: 0 }}
              >
                <span className="title">
                  {y!.description}
                  {y!.seriesKind === "monthly" ? (
                    <span className="tx-series">todo mês</span>
                  ) : y!.seriesTotal ? (
                    <span className="tx-series">
                      {y!.seriesIndex}/{y!.seriesTotal}
                    </span>
                  ) : null}
                </span>
                <span className="sub" style={{ display: "block" }}>
                  {isLate
                    ? `Era para ${day(y!.date)} · ${lateText(y!.date)}`
                    : y!.date === today
                      ? "Hoje"
                      : `Dia ${day(y!.date)}`}
                </span>
              </Link>
              <strong className="num awaiting-value">
                {formatMoney(y!.amountCents, currency)}
              </strong>
              <button
                type="button"
                className="btn small primary"
                disabled={pending}
                onClick={() => received(y!.id)}
              >
                <Check size={14} strokeWidth={2.4} /> Recebi
              </button>
            </div>
          );
        })}
      </div>
      {list.length > SHOWN && (
        <button
          type="button"
          className="awaiting-more"
          aria-expanded={all}
          onClick={() => setAll((o) => !o)}
        >
          {all
            ? "Mostrar menos"
            : `Ver mais ${hidden} ${hidden === 1 ? "item" : "itens"}`}
          <ChevronDown
            size={15}
            strokeWidth={2.2}
            aria-hidden
            style={{ transform: all ? "rotate(180deg)" : undefined }}
          />
        </button>
      )}
      <p className="awaiting-where">
        Todas as receitas a receber ficam em{" "}
        <Link href={`/transacoes?mes=${month}&status=a-receber`}>
          Lançamentos → filtro Status “A receber”
        </Link>{" "}
        (troque o mês para ver as dos próximos). Quem te deve, de todos os
        meses: <Link href="/transacoes?dividas=1">aba Dívidas</Link>.
      </p>
    </section>
  );
}
