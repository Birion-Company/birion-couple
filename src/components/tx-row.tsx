import { ApprovalBadge } from "./approval";
import Link from "next/link";
import { Check, CircleDashed, Clock } from "lucide-react";
import { seriesLabel } from "@/lib/cards";
import { explainParts, explainTx } from "@/lib/explain";
import { formatMoney } from "@/lib/money";
import { ProfitBadge } from "./debt-payments";
import type { Lookups, TxRow } from "@/lib/queries";
import { STATE_INFO, stateLabel, txState } from "@/lib/tx-state";
import { Avatar, CategoryIcon, Money, formatDate } from "./ui";

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


/**
 * Lucro do lançamento: no acerto que pagou uma dívida, o que veio a mais do que era devido;
 * no lançamento original, a soma do que as pessoas pagaram a mais.
 */
export function txProfit(tx: TxRow): number {
  if (tx.settles) return tx.settles.closes ? Math.max(0, tx.amountCents - (tx.settles.owedCents - tx.settles.otherPaidCents)) : 0;
  if (tx.kind === "transfer") return 0;
  return tx.splits.reduce((a, s) => a + (s.paidById && s.paidCents !== null ? s.paidCents - s.amountCents : 0), 0);
}

/** Lucro em destaque embaixo do valor. */
export function ProfitAmount({ tx, currency }: { tx: TxRow; currency: string }) {
  const p = txProfit(tx);
  if (p <= 0) return null;
  return <span className="tx-profit">+{formatMoney(p, currency)} lucro</span>;
}

/**
 * Frase explicativa do lançamento, com selos:
 * - um selo por pessoa que tinha que pagar ("Fulano pagou R$ 30,00", "Fulano deve R$ 60,00");
 * - no acerto que pagou uma dívida, o lucro ou o que ainda falta.
 */
/** Num acerto ligado: parcial ("falta R$ 60,00") ou o lucro/desconto de quem quitou. */
export function SettlesBadge({ tx, currency }: { tx: TxRow; currency: string }) {
  const s = tx.settles;
  if (!s) return null;
  const left = s.owedCents - s.otherPaidCents - tx.amountCents;
  if (!s.closes) return <ProfitBadge paidCents={tx.amountCents} owedCents={tx.amountCents + Math.max(0, left)} restCents={Math.max(0, left)} currency={currency} />;
  return <ProfitBadge paidCents={tx.amountCents} owedCents={s.owedCents - s.otherPaidCents} currency={currency} />;
}

/** Foto (ou iniciais) de quem tinha que pagar, dentro do selo. */
function WhoFace({ id, lookups }: { id: string; lookups: Lookups }) {
  const p = lookups.participants.find((x) => x.id === id);
  return <Avatar name={p?.name ?? "?"} color={p?.color ?? "#94A3B8"} size={18} src={p?.avatarUrl ?? null} />;
}

export function TxExplain(props: { tx: TxRow; lookups: Lookups; me: string | null; currency: string }) {
  const { tx, lookups, me, currency } = props;
  const { head, who } = explainParts({
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
  const name = (id: string) => (id === me ? "Você" : lookups.participants.find((p) => p.id === id)?.name ?? "Alguém");
  const money = (c: number) => formatMoney(c, currency);
  const income = tx.kind === "income";
  // Mesmo formato para todo mundo que tinha que pagar: nome, o que aconteceu e o valor.
  const say = (x: (typeof who)[number]) => {
    const n = name(x.participantId);
    if (income) {
      if (x.state === "open") return `Repassar para ${n}`;
      if (x.state === "own") return `${n === "Você" ? "Sua parte" : `Parte de ${n}`} ${money(x.cents)}`;
      if (x.state === "paid") return `Repassado para ${n} ${money(x.paidCents ?? x.cents)}`;
      return `Repassar para ${n} ${money(x.cents)}`;
    }
    if (x.state === "own") return `${n} pagou ${money(x.cents)}`;
    if (x.state === "paid") return `${n} pagou ${money(x.paidCents ?? x.cents)}`;
    if (x.state === "pending") return `${n} pagou ${money(x.cents)} · confirmando`;
    return `${n} deve`;
  };
  // Pagou parte: o que já pagou riscado e, ao lado, o que falta (~~R$ 500,00~~ R$ 60,00).
  const owedNow = (x: (typeof who)[number]) =>
    x.state === "open" && x.partCents ? (
      <>
        {" "}
        <s className="was" title={`Já pagou ${money(x.partCents)} de ${money(x.cents)}`}>{money(x.partCents)}</s> {money(x.cents - x.partCents)}
      </>
    ) : x.state === "open" ? (
      <> {money(x.cents)}</>
    ) : null;
  return (
    <p className="sub tx-explain">
      {head}
      {who.length > 0 && (
        <span className="who-pays">
          {who.map((x) => (
            <span key={x.participantId} className="tx-paid">
              <span className={`who-badge ${x.state}`}>
                <WhoFace id={x.participantId} lookups={lookups} />
                {say(x)}
                {owedNow(x)}
                {x.state === "paid" || x.state === "own" ? <Check size={12} strokeWidth={2.8} aria-hidden /> : x.state === "pending" ? <Clock size={12} strokeWidth={2.4} aria-hidden /> : <CircleDashed size={12} strokeWidth={2.4} aria-hidden />}
              </span>
              {x.state === "paid" && x.paidCents != null && <ProfitBadge paidCents={x.paidCents} owedCents={x.cents} currency={currency} />}
            </span>
          ))}
        </span>
      )}
      {tx.settles && (
        <>
          <span className="tx-settles-ref">Paga “{tx.settles.description}”, que era de {formatMoney(tx.settles.owedCents, currency)} </span>
          <SettlesBadge tx={tx} currency={currency} />
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
