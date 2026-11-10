import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, CreditCard } from "lucide-react";
import { shortDate } from "@/lib/cards";
import { Money } from "./ui";

type Person = { id: string; cents: number };
type Invoice = { cardId: string; cardName: string; key: string; due: string; totalCents: number; mineCents: number; paid: boolean };

/** "Fulano R$ 20,00 · Pessoa 1 R$ 30,00 · +2": quem está por trás de um total. */
function Who({ list, name, currency }: { list: Person[]; name: (id: string) => string; currency: string }) {
  const top = [...list].sort((a, b) => b.cents - a.cents);
  return (
    <>
      {top.slice(0, 2).map((p, i) => (
        <span key={p.id}>
          {i > 0 ? " · " : ""}
          {name(p.id)} <Money cents={p.cents} currency={currency} />
        </span>
      ))}
      {top.length > 2 ? ` · +${top.length - 2}` : ""}
    </>
  );
}

/**
 * O resumo do painel em três frases: quanto te devem, quanto você tem que pagar do cartão
 * e quanto você deve. Cada frase leva para onde se resolve aquilo.
 */
export function MoneySummary({
  owedToMe,
  iOwe,
  invoices,
  hasCard,
  monthName,
  name,
  currency,
  estimate = false,
}: {
  owedToMe: Person[];
  iOwe: Person[];
  invoices: Invoice[];
  hasCard: boolean;
  /** "novembro": o mês da fatura que o painel está mostrando. */
  monthName: string;
  name: (id: string) => string;
  currency: string;
  /** Mês à frente: só o que é daquele mês, contando que o resto já foi pago (estimativa). */
  estimate?: boolean;
}) {
  const owedTotal = owedToMe.reduce((a, p) => a + p.cents, 0);
  const oweTotal = iOwe.reduce((a, p) => a + p.cents, 0);
  const open = invoices.filter((v) => !v.paid);
  const cardTotal = open.reduce((a, v) => a + v.totalCents, 0);
  const cardMine = open.reduce((a, v) => a + v.mineCents, 0);

  return (
    <section className="summary" aria-label="Resumo" data-tour="dash-summary">
      <Link href="/transacoes?dividas=1" className={`summary-row area-in ${owedTotal > 0 ? "in" : "zero"}`}>
        <span className="summary-icon" aria-hidden>
          {owedTotal > 0 ? <ArrowDownLeft size={18} strokeWidth={2} /> : <Check size={18} strokeWidth={2} />}
        </span>
        <span className="summary-text">
          <span className="summary-say">{owedTotal > 0 ? (estimate ? `Em ${monthName}, as pessoas vão te dever` : "As pessoas te devem") : estimate ? `Em ${monthName}, ninguém vai te dever` : "Ninguém te deve nada"}</span>
          <span className="summary-detail">{owedTotal > 0 ? <Who list={owedToMe} name={name} currency={currency} /> : estimate ? `Nada dividido em ${monthName} até agora` : "Quando alguém te dever, aparece aqui"}</span>
        </span>
        {owedTotal > 0 && <Money cents={owedTotal} currency={currency} className="summary-value pos" />}
        <ChevronRight size={16} className="summary-go" aria-hidden />
      </Link>

      {hasCard && (
        <Link href="/cartoes" className={`summary-row area-card ${cardTotal > 0 ? "card" : "zero"}`}>
          <span className="summary-icon" aria-hidden>
            {cardTotal > 0 ? <CreditCard size={18} strokeWidth={1.9} /> : <Check size={18} strokeWidth={2} />}
          </span>
          <span className="summary-text">
            <span className="summary-say">
              {cardTotal > 0 ? "Você tem que pagar do cartão" : invoices.length ? `Fatura de ${monthName} paga` : `Nenhuma fatura em ${monthName}`}
            </span>
            <span className="summary-detail">{cardTotal > 0 ? `Sua parte das faturas de ${monthName}` : "Nada a pagar no cartão agora"}</span>
          </span>
          {cardTotal > 0 && <Money cents={cardMine} currency={currency} className="summary-value" />}
          {cardTotal > 0 && (
            // A conta à vista: cada fatura, o total, o que é dos outros e a sua parte.
            <span className="summary-bill" role="table" aria-label="Conta das faturas">
              {open.map((v) => (
                <span key={v.cardId + v.key} className="bill-line" role="row">
                  <span role="cell">
                    Fatura {v.cardName} <span className="faint">· vence {shortDate(v.due)}</span>
                  </span>
                  <Money cents={v.totalCents} currency={currency} />
                </span>
              ))}
              {(open.length > 1 || cardMine < cardTotal) && (
                <span className="bill-line sum" role="row">
                  <span role="cell">Total das faturas</span>
                  <Money cents={cardTotal} currency={currency} />
                </span>
              )}
              {cardMine < cardTotal && (
                <>
                  <span className="bill-line minus" role="row">
                    <span role="cell">− Parte de outras pessoas <span className="faint">(elas te devem)</span></span>
                    <Money cents={cardTotal - cardMine} currency={currency} />
                  </span>
                  <span className="bill-line total" role="row">
                    <span role="cell">= Sua parte</span>
                    <Money cents={cardMine} currency={currency} />
                  </span>
                </>
              )}
            </span>
          )}
          <ChevronRight size={16} className="summary-go" aria-hidden />
        </Link>
      )}

      <Link href="/transacoes?dividas=1" className={`summary-row area-out ${oweTotal > 0 ? "out" : "zero"}`}>
        <span className="summary-icon" aria-hidden>
          {oweTotal > 0 ? <ArrowUpRight size={18} strokeWidth={2} /> : <Check size={18} strokeWidth={2} />}
        </span>
        <span className="summary-text">
          <span className="summary-say">{oweTotal > 0 ? (estimate ? `Em ${monthName}, você vai dever` : "Você deve a outras pessoas") : estimate ? `Em ${monthName}, você não vai dever nada` : "Você não deve nada a ninguém"}</span>
          <span className="summary-detail">{oweTotal > 0 ? <Who list={iOwe} name={name} currency={currency} /> : estimate ? `Nada seu em ${monthName} até agora` : "Tudo em dia"}</span>
        </span>
        {oweTotal > 0 && <Money cents={oweTotal} currency={currency} className="summary-value neg" />}
        <ChevronRight size={16} className="summary-go" aria-hidden />
      </Link>
      {estimate && (
        <p className="summary-note faint">
          Estimativa: só o que é de {monthName}, contando que até lá todos pagaram o que devem dos meses anteriores.
        </p>
      )}
    </section>
  );
}
