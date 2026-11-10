import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Check, ChevronRight, CircleDashed, CreditCard, Repeat } from "lucide-react";
import { ArchivedCard, CardPanel, NewCard } from "@/components/card-forms";
import { InvoicePayButton } from "@/components/invoice-pay";
import { Avatar, Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { getCardOverview } from "@/lib/card-queries";
import { invoiceDates, longMonth, monthLabel, shortDate } from "@/lib/cards";
import { filtersToQuery } from "@/lib/filters";
import { CARDS_PER_PERSON_MAX } from "@/lib/defaults";
import { getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Cartões" };

function inDays(n: number) {
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n < 0) return `há ${-n} ${n === -1 ? "dia" : "dias"}`;
  return `em ${n} dias`;
}

const STATE = { closed: "Fechada", open: "Aberta", future: "Próxima" } as const;

type Share = { participantId: string; cents: number; owedCents: number };
type Invoice = { key: string; from: string; to: string; due: string; totalCents: number; state: keyof typeof STATE; shares: Share[]; paid: boolean };
type Names = Map<string, string>;
type Faces = Map<string, { name: string; color: string; avatarUrl: string | null }>;

/** Quantos selos de pessoa aparecem por fatura; o resto vira "+N" (formato compacto). */
const SHARES_SHOWN = 2;

/**
 * Quanto da fatura é de cada pessoa, em selos compactos como os de Lançamentos: primeiro quem ainda
 * deve (o que importa), depois a sua parte e quem já pagou; passando de 2, o resto vira "+N pessoas".
 */
function SharesLine({ shares, me, faces, currency, strong = false }: { shares: Share[]; me: string | null; faces: Faces; currency: string; strong?: boolean }) {
  if (shares.length === 0 || (shares.length === 1 && shares[0].participantId === me)) return null;
  const face = (id: string) => faces.get(id) ?? { name: "Alguém", color: "#94A3B8", avatarUrl: null };
  const money = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency });
  const owing = shares.filter((x) => x.participantId !== me && x.owedCents > 0).sort((a, b) => b.owedCents - a.owedCents);
  const mine = shares.filter((x) => x.participantId === me);
  const paid = shares.filter((x) => x.participantId !== me && x.owedCents === 0);
  const ordered = [...owing, ...mine, ...paid];
  const visible = ordered.length > SHARES_SHOWN + 1 ? ordered.slice(0, SHARES_SHOWN) : ordered;
  const rest = ordered.slice(visible.length);
  const restOwing = rest.filter((x) => x.participantId !== me && x.owedCents > 0).reduce((a, x) => a + x.owedCents, 0);
  const label = (x: Share) =>
    x.participantId === me ? `Sua parte ${money(x.cents)}` : x.owedCents > 0 ? `${face(x.participantId).name} deve ${money(x.owedCents)}` : `${face(x.participantId).name} pagou ${money(x.cents)}`;
  return (
    <span className={`who-pays card-shares compact ${strong ? "strong" : ""}`}>
      {visible.map((x) => {
        const f = face(x.participantId);
        const isMe = x.participantId === me;
        const owes = !isMe && x.owedCents > 0;
        return (
          <span
            key={x.participantId}
            className={`who-badge ${isMe ? "own" : owes ? "open" : "paid"}`}
            style={owes ? ({ "--pc": f.color } as React.CSSProperties) : undefined}
            title={owes && x.owedCents !== x.cents ? `Parte na fatura: ${money(x.cents)}` : undefined}
          >
            <Avatar name={f.name} color={f.color} size={16} src={f.avatarUrl} />
            {isMe ? "Sua parte" : `${f.name} ${owes ? "deve" : "pagou"}`} <Money cents={isMe ? x.cents : owes ? x.owedCents : x.cents} currency={currency} />
            {owes ? <CircleDashed size={11} strokeWidth={2.4} aria-hidden /> : !isMe ? <Check size={11} strokeWidth={2.8} aria-hidden /> : null}
          </span>
        );
      })}
      {rest.length > 0 && (
        <span className="who-badge more" title={rest.map(label).join("\n")}>
          +{rest.length} {rest.length === 1 ? "pessoa" : "pessoas"}
          {restOwing > 0 ? ` · devem ${money(restOwing)}` : ""}
        </span>
      )}
    </span>
  );
}

/** Nos blocos de cima: ver as compras da fatura e marcar como paga (o que antes só a lista tinha). */
function StatActions({ inv, cardId, canPay }: { inv: Invoice | undefined; cardId: string; canPay: boolean }) {
  if (!inv) return null;
  return (
    <div className="card-stat-actions">
      <Link className="btn small ghost" href={`/transacoes${filtersToQuery({ period: "custom", from: inv.from, to: inv.to, card: cardId })}`}>
        Ver compras <ChevronRight size={14} strokeWidth={1.8} aria-hidden />
      </Link>
      {canPay && inv.totalCents > 0 && inv.state !== "future" && <InvoicePayButton cardId={cardId} invoice={inv.key} paid={inv.paid} label={`que vence ${shortDate(inv.due)}`} />}
    </div>
  );
}

function InvoiceRows({ invoices, cardId, currency, me, faces, canPay }: { invoices: Invoice[]; cardId: string; currency: string; me: string | null; faces: Faces; canPay: boolean }) {
  return (
    <div className="rows">
      {invoices.map((inv) => (
        <div key={inv.key} className={`row invoice-row ${inv.paid ? "invoice-paid" : ""}`}>
          <Link className="grow invoice-link" href={`/transacoes${filtersToQuery({ period: "custom", from: inv.from, to: inv.to, card: cardId })}`}>
            <div className="grow">
              {/* Fatura com o nome do mês em que vence (como os bancos chamam): "Fatura de novembro". */}
              <p className="title">
                Fatura de {longMonth(inv.due.slice(0, 7)).replace(` de ${new Date().getFullYear()}`, "").toLowerCase()} · vence {shortDate(inv.due)}
              </p>
              <p className="sub">compras de {shortDate(inv.from)} a {shortDate(inv.to)}</p>
            </div>
            <span className={`badge ${inv.paid ? "invoice-paid-badge" : `invoice-${inv.state}`}`}>{inv.paid ? "Paga" : STATE[inv.state]}</span>
            <span className="amount">
              <Money cents={inv.totalCents} currency={currency} />
            </span>
            <ChevronRight size={16} strokeWidth={1.6} className="faint" aria-hidden />
            {/* Pessoas da fatura numa linha própria (largura toda), para não espremer o título no celular. */}
            <span className="invoice-shares">
              <SharesLine shares={inv.shares} me={me} faces={faces} currency={currency} />
            </span>
          </Link>
          {canPay && inv.totalCents > 0 && inv.state !== "future" && (
            <InvoicePayButton cardId={cardId} invoice={inv.key} paid={inv.paid} label={`que vence ${shortDate(inv.due)}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default async function CardsPage() {
  const auth = await requireAuth();
  const [overview, lookups] = await Promise.all([getCardOverview(auth), getLookupsFor(auth)]);
  const me = auth.participantId;
  const names: Names = new Map(lookups.participants.map((p) => [p.id, p.id === me ? "você" : p.name]));
  const faces: Faces = new Map(lookups.participants.map((p) => [p.id, { name: p.name, color: p.color, avatarUrl: p.avatarUrl ?? null }]));
  const cur = auth.currency;
  const active = overview.cards.filter((c) => !c.card.archived);
  const archived = overview.cards.filter((c) => c.card.archived);
  const admin = auth.role === "owner";
  // Cartões agrupados por dono: os seus primeiro (quem administra vê os de todos).
  const countOf = (id: string) => active.filter((c) => c.card.ownerId === id).length;
  const ownerIds = [...new Set(active.map((c) => c.card.ownerId ?? ""))].sort((a, b) =>
    a === me ? -1 : b === me ? 1 : (names.get(a) ?? "").localeCompare(names.get(b) ?? ""),
  );
  const groups = ownerIds.map((id) => ({ id, cards: active.filter((c) => (c.card.ownerId ?? "") === id) }));
  // Para quem dá para cadastrar mais um cartão.
  const owners = admin
    ? lookups.participants.filter((p) => !p.archived && countOf(p.id) < CARDS_PER_PERSON_MAX).map((p) => ({ id: p.id, name: p.id === me ? `${p.name} (você)` : p.name }))
    : undefined;
  const blocked = !me
    ? "Sua conta não está ligada a uma pessoa da família."
    : !admin && countOf(me) >= CARDS_PER_PERSON_MAX
      ? `Você já tem ${CARDS_PER_PERSON_MAX} cartões. Arquive um para cadastrar outro.`
      : admin && owners?.length === 0
        ? `Todas as pessoas já têm ${CARDS_PER_PERSON_MAX} cartões.`
        : null;

  return (
    <div className="cards-page">
      <div className="page-head">
        <div>
          <h1>Cartões</h1>
          <p className="muted">Faturas e vencimentos.</p>
        </div>
        {active.length > 0 && <NewCard startOpen={false} owners={owners} defaultOwner={me} blocked={blocked} />}
      </div>

      <div data-tour="cards">
      {active.length === 0 && (
        <>
          <div className="notice" style={{ marginBottom: 16 }} data-tour="cards-intro">
            <CreditCard size={16} strokeWidth={1.7} style={{ verticalAlign: -3, marginRight: 6 }} aria-hidden />
            Cadastre seu cartão com o dia de fechamento (até {CARDS_PER_PERSON_MAX} por pessoa). O app avisa antes de fechar e vencer.
          </div>
          <NewCard startOpen owners={owners} defaultOwner={me} blocked={blocked} />
        </>
      )}

      {groups.map((g) => (
        <section key={g.id || "sem-dono"} className="card-owner" aria-label={g.id === me ? "Seus cartões" : `Cartões de ${names.get(g.id) ?? "alguém"}`}>
          {(admin || g.id !== me) && (
            <h2 className="card-owner-title">
              {g.id === me ? "Seus cartões" : g.id ? `Cartões de ${names.get(g.id) ?? "alguém"}` : "Sem dono"}
              <span className="faint"> · {g.cards.length} de {CARDS_PER_PERSON_MAX}</span>
            </h2>
          )}
          {g.cards.map(({ card, schedule: s, openTotal, dueTotal, openShares, dueShares, invoices, series }) => (
        <CardPanel
          key={card.id}
          card={card}
          owners={admin ? lookups.participants.filter((p) => !p.archived && (p.id === card.ownerId || countOf(p.id) < CARDS_PER_PERSON_MAX)).map((p) => ({ id: p.id, name: p.name })) : undefined}
          header={
            <div className="credit-card-id">
              <span className="card-chip" style={{ background: card.color }} aria-hidden>
                <CreditCard size={18} strokeWidth={1.8} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h2>{card.name}</h2>
                <p className="faint">
                  Fecha dia {card.closingDay} · vence dia {card.dueDay}
                  {card.alertDays === null ? " · sem avisos" : ""}
                </p>
              </div>
            </div>
          }
        >
          <div className="card-stats" data-tour="cards-stats">
            {/* A pagar à esquerda (a anterior), a aberta à direita (a que vem). */}
            <div className={`card-stat ${s.daysToDue <= (card.alertDays ?? -1) && dueTotal > 0 && !invoices.find((i) => i.key === s.dueInvoice)?.paid ? "warn" : ""}`}>
              <p className="label">
                <strong>{s.dueInvoice === s.open ? "Vencimento desta fatura" : "Próxima fatura a pagar"}</strong>
              </p>
              <p className="value"><Money cents={dueTotal} currency={cur} /></p>
              <SharesLine shares={dueShares} me={me} faces={faces} currency={cur} strong />
              <p className="hint">
                <CalendarClock size={13} strokeWidth={1.8} style={{ verticalAlign: -2 }} aria-hidden /> vence {shortDate(s.dueDate)}, {inDays(s.daysToDue)}
                {s.dueInvoice !== s.open ? " · já fechou" : ""}
                {invoices.find((i) => i.key === s.dueInvoice)?.paid && <strong className="pos"> · paga</strong>}
              </p>
              <StatActions inv={invoices.find((i) => i.key === s.dueInvoice)} cardId={card.id} canPay={admin || card.ownerId === me} />
            </div>
            <div className="card-stat">
              <p className="label">
                <strong>Fatura aberta</strong> · vence {shortDate(invoiceDates(s.open, card).due)}
              </p>
              <p className="value"><Money cents={openTotal} currency={cur} /></p>
              <SharesLine shares={openShares} me={me} faces={faces} currency={cur} strong />
              <p className="hint">fecha {shortDate(s.closingDate)}, {inDays(s.daysToClosing)}</p>
              {s.dueInvoice !== s.open && <StatActions inv={invoices.find((i) => i.key === s.open)} cardId={card.id} canPay={admin || card.ownerId === me} />}
            </div>
          </div>

          {/* As duas faturas dos blocos acima não se repetem aqui: só as outras (as próximas, com parcelas). */}
          {invoices.filter((i) => i.key !== s.dueInvoice && i.key !== s.open).length > 0 && <h3 className="card-subhead">Próximas faturas</h3>}
          <InvoiceRows invoices={invoices.filter((i) => i.key !== s.dueInvoice && i.key !== s.open).slice(0, 4)} cardId={card.id} currency={cur} me={me} faces={faces} canPay={admin || card.ownerId === me} />
          {invoices.filter((i) => i.key !== s.dueInvoice && i.key !== s.open).length > 4 && (
            <details className="more-invoices">
              <summary>Mais {invoices.filter((i) => i.key !== s.dueInvoice && i.key !== s.open).length - 4} {invoices.filter((i) => i.key !== s.dueInvoice && i.key !== s.open).length - 4 === 1 ? "fatura" : "faturas"} com parcelas lançadas</summary>
              <InvoiceRows invoices={invoices.filter((i) => i.key !== s.dueInvoice && i.key !== s.open).slice(4)} cardId={card.id} currency={cur} me={me} faces={faces} canPay={admin || card.ownerId === me} />
            </details>
          )}
          {/* "Todo mês" sem fim já está em Contas fixas (Lançamentos): aqui só o que tem fim (parcelados). */}
          {series.some((x) => x.total !== null) && (
            <>
              <h3 className="card-subhead">Parcelados em andamento</h3>
              <div className="rows">
                {series.filter((x) => x.total !== null).map((x) => (
                  <Link key={x.id} className="row series-row" href={`/transacoes/${x.nextId}`}>
                    <Repeat size={16} strokeWidth={1.7} className="faint" aria-hidden />
                    <div className="grow">
                      <p className="title neg">{x.description}</p>
                      <p className="sub">
                        {x.total === null
                          ? "repete todo mês, sem data para acabar"
                          : `${x.kind === "installment" ? `parcela ${x.next} de ${x.total}` : `mês ${x.next} de ${x.total}`} · ${x.remaining === 1 ? "última" : `faltam ${x.remaining}`} · até ${monthLabel(x.lastDate.slice(0, 7))}`}
                      </p>
                    </div>
                    <span className="amount">
                      <Money cents={x.amountCents} currency={cur} className="neg" />
                      <span className="sub" style={{ display: "block", textAlign: "right" }}>por mês</span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardPanel>
      ))}
        </section>
      ))}

      </div>

      {archived.length > 0 && (
        <section className="card section" aria-label="Cartões arquivados">
          <h2 style={{ marginBottom: 8 }}>Arquivados</h2>
          <div className="rows">
            {archived.map(({ card }) => (
              <ArchivedCard key={card.id} card={card} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
