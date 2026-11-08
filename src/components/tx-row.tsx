import Link from "next/link";
import { seriesLabel } from "@/lib/cards";
import type { Lookups, TxRow } from "@/lib/queries";
import { Dot, Money, formatDate } from "./ui";

export function txMeta(tx: TxRow, lookups: Lookups) {
  const payer = lookups.participants.find((p) => p.id === tx.payerId);
  const cat = lookups.categories.find((c) => c.id === tx.categoryId);
  const status = lookups.statuses.find((s) => s.id === tx.statusId);
  const project = lookups.projects.find((p) => p.id === tx.projectId);
  const card = lookups.cards.find((c) => c.id === tx.cardId);
  const series = seriesLabel(tx.seriesKind, tx.seriesIndex, tx.seriesTotal);
  const people = tx.splits.map((s) => lookups.participants.find((p) => p.id === s.participantId)?.name).filter(Boolean);
  return { payer, cat, status, project, card, series, people };
}

export function amountTone(kind: string) {
  return kind === "income" ? "pos" : kind === "transfer" || kind === "loan" ? "muted" : "";
}

/** Linha compacta de lançamento, usada no painel. */
export function TxRowLink({ tx, lookups, currency }: { tx: TxRow; lookups: Lookups; currency: string }) {
  const { cat, status, card, series } = txMeta(tx, lookups);
  return (
    <Link href={`/transacoes/${tx.id}`} className="row">
      <Dot color={cat?.color ?? "#CBD5E1"} />
      <div className="grow" style={{ minWidth: 0 }}>
        <p className="title">
          {tx.description}
          {series && <span className="tx-series">{series.replace("Parcela ", "")}</span>}
        </p>
        <p className="sub">{[formatDate(tx.date), cat?.name, card?.name].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="amount">
        <Money cents={tx.amountCents} currency={currency} className={amountTone(tx.kind)} />
        {status && (
          <p className="sub" style={{ textAlign: "right" }}>
            {status.name}
          </p>
        )}
      </div>
    </Link>
  );
}
