import Link from "next/link";
import { Check } from "lucide-react";
import { seriesLabel } from "@/lib/cards";
import { explainTx } from "@/lib/explain";
import type { Lookups, TxRow } from "@/lib/queries";
import { CategoryIcon, Money, formatDate } from "./ui";

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

/** Frase didática: quem pagou, em qual cartão e quem deve reembolsar. */
export function txExplain(tx: TxRow, lookups: Lookups, me: string | null, currency: string) {
  const status = lookups.statuses.find((s) => s.id === tx.statusId);
  return explainTx({
    kind: tx.kind,
    amountCents: tx.amountCents,
    payerId: tx.payerId,
    splits: tx.splits,
    cardName: tx.cardId ? lookups.cards.find((c) => c.id === tx.cardId)?.name ?? "de outra pessoa" : null,
    settled: status?.behavior === "settled",
    me,
    names: Object.fromEntries(lookups.participants.map((p) => [p.id, p.name])),
    currency,
  });
}

const SETTLED = " · já acertado";

/** Frase explicativa do lançamento; "já acertado" vira um selo verde. */
export function TxExplain(props: { tx: TxRow; lookups: Lookups; me: string | null; currency: string }) {
  const full = txExplain(props.tx, props.lookups, props.me, props.currency);
  const settled = full.endsWith(SETTLED);
  return (
    <p className="sub tx-explain">
      {settled ? full.slice(0, -SETTLED.length) : full}
      {settled && (
        <span className="settled-badge">
          <Check size={12} strokeWidth={2.6} aria-hidden /> Já acertado
        </span>
      )}
    </p>
  );
}

/** Bolinha com a cor do status do lançamento (pendente, pago, acertado…). */
export function StatusDot({ status }: { status?: { name: string; color: string } | null }) {
  const label = status ? `Status: ${status.name}` : "Sem status";
  return <span className="status-dot" style={{ background: status?.color ?? "transparent", borderColor: status?.color ?? "var(--text-3)" }} title={label} role="img" aria-label={label} />;
}

export function amountTone(kind: string) {
  return kind === "income" ? "pos" : kind === "transfer" || kind === "loan" ? "muted" : "";
}

/** Linha compacta de lançamento, usada no painel. */
export function TxRowLink({ tx, lookups, currency, me = null }: { tx: TxRow; lookups: Lookups; currency: string; me?: string | null }) {
  const { cat, status, series } = txMeta(tx, lookups);
  return (
    <Link href={`/transacoes/${tx.id}`} className="row tx-row">
      <StatusDot status={status} />
      <CategoryIcon icon={cat?.icon} color={cat?.color} title={cat?.name ?? "Sem categoria"} />
      <div className="grow" style={{ minWidth: 0 }}>
        <p className="title">
          {tx.description}
          {series && <span className="tx-series">{series.replace("Parcela ", "")}</span>}
        </p>
        <p className="sub">{[formatDate(tx.date), cat?.name ?? "Sem categoria"].join(" · ")}</p>
        <TxExplain tx={tx} lookups={lookups} me={me} currency={currency} />
      </div>
      <div className="amount">
        <Money cents={tx.amountCents} currency={currency} className={amountTone(tx.kind)} />
        {status && <p className="sub tx-status">{status.name}</p>}
      </div>
    </Link>
  );
}
