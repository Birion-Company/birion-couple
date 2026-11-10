import { ApprovalBadge } from "./approval";
import Link from "next/link";
import { Check } from "lucide-react";
import { seriesLabel } from "@/lib/cards";
import { explainTx } from "@/lib/explain";
import { formatMoney } from "@/lib/money";
import { ProfitBadge } from "./debt-payments";
import type { Lookups, TxRow } from "@/lib/queries";
import { STATE_INFO, stateLabel, txState } from "@/lib/tx-state";
import { CategoryIcon, Money, formatDate } from "./ui";

const KIND_LOOK: Record<string, { icon: string; color: string; name: string }> = {
  income: { icon: "money", color: "#3BAA7F", name: "Receita" },
  loan: { icon: "money", color: "#94A3B8", name: "Dívida" },
  transfer: { icon: "money", color: "#94A3B8", name: "Acerto" },
};

/** Ícone, cor e nome que vão ao lado do lançamento: a categoria na despesa; o tipo nos outros (receita não tem categoria). */
export function txLook(tx: { kind: string }, cat: { icon: string; color: string; name: string } | undefined) {
  if (tx.kind !== "expense") return KIND_LOOK[tx.kind] ?? KIND_LOOK.transfer;
  return cat ? { icon: cat.icon, color: cat.color, name: cat.name } : { icon: "tag", color: "#94A3B8", name: "Sem categoria" };
}

export function txMeta(tx: TxRow, lookups: Lookups) {
  const payer = lookups.participants.find((p) => p.id === tx.payerId);
  const cat = lookups.categories.find((c) => c.id === tx.categoryId);
  const state = txState(tx);
  const status = { name: stateLabel(state, tx.kind), color: STATE_INFO[state].color, help: STATE_INFO[state].help };
  const project = lookups.projects.find((p) => p.id === tx.projectId);
  const card = lookups.cards.find((c) => c.id === tx.cardId);
  const series = seriesLabel(tx.seriesKind, tx.seriesIndex, tx.seriesTotal);
  const people = tx.splits.map((s) => lookups.participants.find((p) => p.id === s.participantId)?.name).filter(Boolean);
  return { payer, cat, status, project, card, series, people };
}

/** Frase didática: quem pagou, em qual cartão e quem ainda deve. */
export function txExplain(tx: TxRow, lookups: Lookups, me: string | null, currency: string) {
  return explainTx({
    kind: tx.kind,
    amountCents: tx.amountCents,
    payerId: tx.payerId,
    splits: tx.splits,
    cardName: tx.cardId ? lookups.cards.find((c) => c.id === tx.cardId)?.name ?? "de outra pessoa" : null,
    settled: tx.settled && tx.kind !== "transfer",
    me,
    names: Object.fromEntries(lookups.participants.map((p) => [p.id, p.name])),
    currency,
  });
}

const SETTLED = " · já acertado";

/**
 * Lucro do lançamento: no acerto que pagou uma dívida, o que veio a mais do que era devido;
 * no lançamento original, a soma do que as pessoas pagaram a mais. Negativo = desconto.
 */
export function txProfit(tx: TxRow): number {
  if (tx.settles) return tx.amountCents - tx.settles.owedCents;
  if (tx.kind === "transfer") return 0;
  return tx.splits.reduce((a, s) => a + (s.paidById && s.paidCents !== null ? s.paidCents + (s.restCents ?? 0) - s.amountCents : 0), 0);
}

/** Lucro em destaque embaixo do valor. */
export function ProfitAmount({ tx, currency }: { tx: TxRow; currency: string }) {
  const p = txProfit(tx);
  if (p <= 0) return null;
  return <span className="tx-profit">+{formatMoney(p, currency)} lucro</span>;
}

/**
 * Frase explicativa do lançamento, com selos:
 * - "Fulano pagou R$ 30,00" (verde) para cada parte já paga, e o lucro ou desconto do pagamento;
 * - no acerto que pagou uma dívida, o lucro ou desconto em relação ao que era devido.
 */
export function TxExplain(props: { tx: TxRow; lookups: Lookups; me: string | null; currency: string }) {
  const { tx, lookups, me, currency } = props;
  const full = txExplain(tx, lookups, me, currency);
  const settled = full.endsWith(SETTLED);
  const name = (id: string) => (id === me ? "Você" : lookups.participants.find((p) => p.id === id)?.name ?? "Alguém");
  const paid = tx.kind === "transfer" ? [] : tx.splits.filter((s) => s.paidById && s.participantId !== tx.payerId);
  const income = tx.kind === "income";
  return (
    <p className="sub tx-explain">
      {settled ? full.slice(0, -SETTLED.length) : full}
      {settled && (
        <span className="settled-badge">
          <Check size={12} strokeWidth={2.6} aria-hidden /> Já acertado
        </span>
      )}
      {paid.map((s) => (
        <span key={s.participantId} className="tx-paid">
          <span className="settled-badge">
            <Check size={12} strokeWidth={2.6} aria-hidden />{" "}
            {income ? `Repassado para ${name(s.participantId)}` : `${name(s.participantId)} pagou`} {formatMoney(s.paidCents ?? s.amountCents, currency)}
          </span>
          {s.paidCents !== null && <ProfitBadge paidCents={s.paidCents} owedCents={s.amountCents} restCents={s.restCents} currency={currency} />}
        </span>
      ))}
      {tx.settles && (
        <>
          <span className="tx-settles-ref"> · paga “{tx.settles.description}”, que era de {formatMoney(tx.settles.owedCents, currency)}</span>
          <ProfitBadge paidCents={tx.amountCents} owedCents={tx.settles.owedCents} restCents={tx.settles.restCents} currency={currency} />
        </>
      )}
    </p>
  );
}

/** Bolinha com a cor do status do lançamento (a pagar, a acertar, pago, acertado). */
export function StatusDot({ status }: { status?: { name: string; color: string; help?: string } | null }) {
  const label = status ? `Status: ${status.name}${status.help ? `. ${status.help}` : ""}` : "Sem status";
  return <span className="status-dot" style={{ background: status?.color ?? "transparent", borderColor: status?.color ?? "var(--text-3)" }} title={label} role="img" aria-label={label} />;
}

export function amountTone(kind: string) {
  return kind === "income" ? "pos" : kind === "transfer" || kind === "loan" ? "muted" : "";
}

/** Linha compacta de lançamento, usada no painel. */
export function TxRowLink({ tx, lookups, currency, me = null }: { tx: TxRow; lookups: Lookups; currency: string; me?: string | null }) {
  const { cat, status, series } = txMeta(tx, lookups);
  const look = txLook(tx, cat);
  return (
    <Link href={`/transacoes/${tx.id}`} className={`row tx-row ${txProfit(tx) > 0 ? "has-profit" : ""}`}>
      <StatusDot status={status} />
      <CategoryIcon icon={look.icon} color={look.color} title={look.name} />
      <div className="grow" style={{ minWidth: 0 }}>
        <p className="title tx-title">
          <span className="tx-desc" title={tx.description}>{tx.description}</span>
          {series && <span className="tx-series">{series}</span>}
          <ApprovalBadge approval={tx.approval} me={me} names={Object.fromEntries(lookups.participants.map((p) => [p.id, p.name]))} />
        </p>
        <p className="sub tx-meta">{[formatDate(tx.date), look.name].join(" · ")}</p>
        <TxExplain tx={tx} lookups={lookups} me={me} currency={currency} />
      </div>
      <div className="amount">
        <Money cents={tx.amountCents} currency={currency} className={amountTone(tx.kind)} />
        {status && <p className="sub tx-status">{status.name}</p>}
        <ProfitAmount tx={tx} currency={currency} />
      </div>
    </Link>
  );
}
