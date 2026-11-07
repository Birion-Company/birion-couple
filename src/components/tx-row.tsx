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
  return kind === "income" ? "pos" : kind === "transfer" ? "muted" : "";
}

/** Linha compacta de lançamento, usada no painel. */
export function TxRowLink({ tx, lookups, currency }: { tx: TxRow; lookups: Lookups; currency: string }) {
  const { payer, cat, status, card, series } = txMeta(tx, lookups);
  return (
    <Link href={`/transacoes/${tx.id}`} className="row">
      <Dot color={cat?.color ?? "#CBD5E1"} />
      <div className="grow">
        <p className="title">{tx.description}</p>
        <p className="sub">
          {formatDate(tx.date)}
          {payer ? ` · ${payer.name}` : ""}
          {cat ? ` · ${cat.name}` : ""}
          {card ? ` · ${card.name}` : ""}
          {series ? ` · ${series}` : ""}
        </p>
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
