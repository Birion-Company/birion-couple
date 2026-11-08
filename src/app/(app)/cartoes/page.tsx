import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronRight, CreditCard, Repeat } from "lucide-react";
import { ArchivedCard, CardPanel, NewCard } from "@/components/card-forms";
import { Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { getCardOverview } from "@/lib/card-queries";
import { monthLabel, shortDate } from "@/lib/cards";
import { filtersToQuery } from "@/lib/filters";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Cartões" };

function inDays(n: number) {
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n < 0) return `há ${-n} ${n === -1 ? "dia" : "dias"}`;
  return `em ${n} dias`;
}

const STATE = { closed: "Fechada", open: "Aberta", future: "Próxima" } as const;

type Share = { participantId: string; cents: number };
type Invoice = { key: string; from: string; to: string; due: string; totalCents: number; state: keyof typeof STATE; shares: Share[] };
type Names = Map<string, string>;

/**
 * "Sua parte R$ X · Clara R$ Y": quanto da fatura é de cada pessoa.
 * Só aparece quando a fatura tem compras divididas com mais alguém.
 */
function SharesLine({ shares, me, names, currency, strong = false }: { shares: Share[]; me: string | null; names: Names; currency: string; strong?: boolean }) {
  if (shares.length === 0 || (shares.length === 1 && shares[0].participantId === me)) return null;
  const mine = shares.find((x) => x.participantId === me);
  const others = shares.filter((x) => x.participantId !== me);
  return (
    <span className={`card-shares ${strong ? "strong" : ""}`}>
      {mine && (
        <>
          sua parte <Money cents={mine.cents} currency={currency} />
        </>
      )}
      {others.map((o, i) => (
        <span key={o.participantId}>
          {mine || i > 0 ? " · " : ""}
          {names.get(o.participantId) ?? "Alguém"} <Money cents={o.cents} currency={currency} />
        </span>
      ))}
    </span>
  );
}

function InvoiceRows({ invoices, cardId, currency, me, names }: { invoices: Invoice[]; cardId: string; currency: string; me: string | null; names: Names }) {
  return (
    <div className="rows">
      {invoices.map((inv) => (
        <Link key={inv.key} className="row invoice-row" href={`/transacoes${filtersToQuery({ period: "custom", from: inv.from, to: inv.to, card: cardId })}`}>
          <div className="grow">
            <p className="title">{monthLabel(inv.key)}</p>
            <p className="sub">
              compras de {shortDate(inv.from)} a {shortDate(inv.to)} · vence {shortDate(inv.due)}
            </p>
            <p className="sub">
              <SharesLine shares={inv.shares} me={me} names={names} currency={currency} />
            </p>
          </div>
          <span className={`badge invoice-${inv.state}`}>{STATE[inv.state]}</span>
          <span className="amount">
            <Money cents={inv.totalCents} currency={currency} />
          </span>
          <ChevronRight size={16} strokeWidth={1.6} className="faint" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

export default async function CardsPage() {
  const auth = await requireAuth();
  const [overview, lookups] = await Promise.all([getCardOverview(auth), getLookups(auth.householdId)]);
  const me = auth.participantId;
  const names: Names = new Map(lookups.participants.map((p) => [p.id, p.id === me ? "você" : p.name]));
  const cur = auth.currency;
  const active = overview.cards.filter((c) => !c.card.archived);
  const archived = overview.cards.filter((c) => c.card.archived);

  return (
    <div className="cards-page">
      <div className="page-head">
        <div>
          <h1>Cartões</h1>
          <p className="muted">Faturas, fechamento e vencimento de cada cartão de crédito.</p>
        </div>
        {active.length > 0 && <NewCard startOpen={false} />}
      </div>

      <div data-tour="cards">
      {active.length === 0 && (
        <>
          <div className="notice" style={{ marginBottom: 16 }} data-tour="cards-intro">
            <CreditCard size={16} strokeWidth={1.7} style={{ verticalAlign: -3, marginRight: 6 }} aria-hidden />
            Cadastre um cartão com o dia em que a fatura fecha. O vencimento é sugerido na hora, e o app avisa quando o fechamento ou o
            vencimento estiver chegando. Depois é só escolher o cartão ao lançar uma compra, inclusive parcelada.
          </div>
          <NewCard startOpen />
        </>
      )}

      {active.map(({ card, schedule: s, openTotal, dueTotal, openShares, dueShares, invoices, series }) => (
        <CardPanel
          key={card.id}
          card={card}
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
            <div className="card-stat">
              <p className="label">Fatura aberta · {monthLabel(s.open)}</p>
              <p className="value"><Money cents={openTotal} currency={cur} /></p>
              <SharesLine shares={openShares} me={me} names={names} currency={cur} strong />
              <p className="hint">fecha {shortDate(s.closingDate)}, {inDays(s.daysToClosing)}</p>
            </div>
            <div className={`card-stat ${s.daysToDue <= (card.alertDays ?? -1) && dueTotal > 0 ? "warn" : ""}`}>
              <p className="label">{s.dueInvoice === s.open ? "Vencimento desta fatura" : `Próximo vencimento · ${monthLabel(s.dueInvoice)}`}</p>
              <p className="value"><Money cents={dueTotal} currency={cur} /></p>
              <SharesLine shares={dueShares} me={me} names={names} currency={cur} strong />
              <p className="hint">
                <CalendarClock size={13} strokeWidth={1.8} style={{ verticalAlign: -2 }} aria-hidden /> vence {shortDate(s.dueDate)}, {inDays(s.daysToDue)}
                {s.dueInvoice !== s.open ? " · já fechou" : ""}
              </p>
            </div>
          </div>

          <h3 className="card-subhead">Faturas</h3>
          <InvoiceRows invoices={invoices.slice(0, 4)} cardId={card.id} currency={cur} me={me} names={names} />
          {invoices.length > 4 && (
            <details className="more-invoices">
              <summary>Mais {invoices.length - 4} {invoices.length - 4 === 1 ? "fatura" : "faturas"} com parcelas lançadas</summary>
              <InvoiceRows invoices={invoices.slice(4)} cardId={card.id} currency={cur} me={me} names={names} />
            </details>
          )}
          {series.length > 0 && (
            <>
              <h3 className="card-subhead">Parcelados e recorrentes em andamento</h3>
              <div className="rows">
                {series.map((x) => (
                  <Link key={x.id} className="row series-row" href={`/transacoes/${x.nextId}`}>
                    <Repeat size={16} strokeWidth={1.7} className="faint" aria-hidden />
                    <div className="grow">
                      <p className="title">{x.description}</p>
                      <p className="sub">
                        {x.total === null
                          ? "repete todo mês, sem data para acabar"
                          : `${x.kind === "installment" ? `parcela ${x.next} de ${x.total}` : `mês ${x.next} de ${x.total}`} · ${x.remaining === 1 ? "última" : `faltam ${x.remaining}`} · até ${monthLabel(x.lastDate.slice(0, 7))}`}
                      </p>
                    </div>
                    <span className="amount">
                      <Money cents={x.amountCents} currency={cur} />
                      <span className="sub" style={{ display: "block", textAlign: "right" }}>por mês</span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardPanel>
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
