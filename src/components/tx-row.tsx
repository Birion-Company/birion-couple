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
  return <span className="tx-profit">+{formatMoney(p, currency)} de lucro</span>;
}

/**
 * Frase explicativa do lançamento, com selos:
 * - um selo por pessoa que tinha que pagar ("Fulano pagou R$ 30,00", "Fulano deve R$ 60,00");
 * - no acerto que pagou uma dívida, o valor a mais ou o que ainda falta.
 */
/** Num acerto ligado e parcial: "falta R$ 60,00". */
export function SettlesBadge({ tx, currency }: { tx: TxRow; currency: string }) {
  const s = tx.settles;
  if (!s) return null;
  const left = s.owedCents - s.otherPaidCents - tx.amountCents;
  if (!s.closes) return <ProfitBadge paidCents={tx.amountCents} owedCents={tx.amountCents + Math.max(0, left)} restCents={Math.max(0, left)} currency={currency} />;
  // Quitou com lucro: o lucro já aparece embaixo do valor (não repete aqui).
  return null;
}

/**
 * Valor da linha. Numa dívida que já foi paga em parte, o valor original fica riscado e o que
 * falta aparece em destaque logo abaixo (é o valor que importa agora).
 */
export function TxAmount({ tx, currency }: { tx: TxRow; currency: string }) {
  const open = tx.kind === "loan" ? tx.splits.find((s) => !s.paidById && s.participantId !== tx.payerId && (s.partCents ?? 0) > 0) : undefined;
  if (!open) return <Money cents={tx.amountCents} currency={currency} className={amountTone(tx.kind)} />;
  return (
    <span className="amount-partial">
      <s className="was">
        <Money cents={tx.amountCents} currency={currency} />
      </s>
      <Money cents={tx.amountCents - (open.partCents ?? 0)} currency={currency} className="amount-now" />
    </span>
  );
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
    awaitingReceipt: tx.awaitingReceipt,
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
  // Valor que ainda falta (já descontado o que pagou em parte); o riscado fica no valor da linha.
  const owedNow = (x: (typeof who)[number]) =>
    x.state !== "open" ? null : x.partCents ? (
      <>
        {" "}
        {money(x.cents - x.partCents)}
        {/* Acerto parcial: avisa quanto já foi pago. */}
        <span className="who-part"> · pagou {money(x.partCents)}</span>
      </>
    ) : (
      <> {money(x.cents)}</>
    );
  // Quem ainda deve vem primeiro (é o que a pessoa precisa ver logo), depois quem está confirmando,
  // quem já pagou e, por fim, a parte de quem pagou. Com muita gente, só os 3 primeiros + um resumo.
  const ORDER = { open: 0, pending: 1, paid: 2, own: 3 } as const;
  const sorted = [...who].sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.cents - a.cents);
  const MAX = 3;
  const visible = sorted.length > MAX + 1 ? sorted.slice(0, MAX) : sorted;
  const rest = sorted.slice(visible.length);
  const restOwing = rest.filter((x) => x.state === "open");
  const colorOf = (id: string) => lookups.participants.find((p) => p.id === id)?.color ?? "#94A3B8";
  return (
    <p className="sub tx-explain">
      {/* Acerto ligado a uma dívida: a frase diz o que ele paga; o "falta" vai junto dos selos. */}
      {tx.settles ? `${head.replace(/^Acerto para /, "Para ")} · paga “${tx.settles.description}”, de ${formatMoney(tx.settles.owedCents, currency)}` : head}
      {who.length > 0 && (
        <span className="who-pays">
          {visible.map((x) => (
            <span key={x.participantId} className="tx-paid">
              {/* Quem deve aparece na cor cadastrada da pessoa, em destaque. */}
              <span className={`who-badge ${x.state}`} style={x.state === "open" ? ({ "--pc": colorOf(x.participantId) } as React.CSSProperties) : undefined}>
                <WhoFace id={x.participantId} lookups={lookups} />
                {say(x)}
                {owedNow(x)}
                {x.state === "paid" || x.state === "own" ? <Check size={12} strokeWidth={2.8} aria-hidden /> : x.state === "pending" ? <Clock size={12} strokeWidth={2.4} aria-hidden /> : <CircleDashed size={12} strokeWidth={2.4} aria-hidden />}
              </span>
            </span>
          ))}
          {rest.length > 0 && (
            <span className="who-badge more" title={rest.map((x) => name(x.participantId)).join(", ")}>
              +{rest.length} {rest.length === 1 ? "pessoa" : "pessoas"}
              {restOwing.length > 0 && ` `}
            </span>
          )}
          {tx.settles && <SettlesBadge tx={tx} currency={currency} />}
        </span>
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
  return kind === "income" ? "pos" : kind === "expense" ? "neg" : kind === "transfer" || kind === "loan" ? "muted" : "";
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
          <span className={`tx-desc ${tx.kind === "expense" ? "neg" : ""}`} title={tx.description}>{tx.description}</span>
          {series && <span className="tx-series">{series}</span>}
          <ApprovalBadge approval={tx.approval} me={me} names={Object.fromEntries(lookups.participants.map((p) => [p.id, p.name]))} />
        </p>
        <p className="sub tx-meta">{[formatDate(tx.date), look.name].join(" · ")}</p>
        <TxExplain tx={tx} lookups={lookups} me={me} currency={currency} />
      </div>
      <div className="amount">
        <TxAmount tx={tx} currency={currency} />
        {status && <p className="sub tx-status">{status.name}</p>}
        <ProfitAmount tx={tx} currency={currency} />
      </div>
    </Link>
  );
}
