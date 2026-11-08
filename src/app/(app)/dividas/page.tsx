import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, HandCoins } from "lucide-react";
import { SettleButton } from "@/components/settle-button";
import { Avatar, Money, formatDate } from "@/components/ui";
import { canEditTx } from "@/lib/access";
import { requireAuth } from "@/lib/auth";
import { seriesLabel } from "@/lib/cards";
import { getDebtLedger, getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Dívidas" };

const KIND: Record<string, string> = { expense: "despesa dividida", income: "receita dividida", loan: "empréstimo", transfer: "pagamento" };

export default async function DebtsPage() {
  const auth = await requireAuth();
  const lookups = await getLookupsFor(auth);
  const ledger = await getDebtLedger(auth, lookups);
  const cur = auth.currency;
  const people = new Map(lookups.participants.map((p) => [p.id, p]));
  const name = (id: string | null) => (id ? people.get(id)?.name ?? "Alguém" : "ninguém");
  const settled = lookups.statuses.find((s) => s.behavior === "settled" && !s.archived);
  const owedToMe = ledger.people.filter((p) => p.net > 0).reduce((a, p) => a + p.net, 0);
  const iOwe = ledger.people.filter((p) => p.net < 0).reduce((a, p) => a - p.net, 0);

  return (
    <div className="debts-page">
      <div className="page-head">
        <div>
          <h1>Dívidas</h1>
          <p className="muted">O que cada pessoa deve, de onde veio e o que já foi pago.</p>
        </div>
        <Link className="btn primary" href="/transacoes/nova?tipo=emprestimo">
          <HandCoins size={16} strokeWidth={1.7} /> Registrar empréstimo
        </Link>
      </div>

      {auth.participantId && (
        <div className="stats debts-stats" data-tour="debts">
          <div className="stat">
            <p className="label">Te devem</p>
            <p className="value pos"><Money cents={owedToMe} currency={cur} /></p>
            <p className="hint">{ledger.people.filter((p) => p.net > 0).length} pessoa(s)</p>
          </div>
          <div className="stat">
            <p className="label">Você deve</p>
            <p className="value neg"><Money cents={iOwe} currency={cur} /></p>
            <p className="hint">{ledger.people.filter((p) => p.net < 0).length} pessoa(s)</p>
          </div>
          <div className="stat">
            <p className="label">Saldo</p>
            <p className="value"><Money cents={owedToMe - iOwe} currency={cur} signed /></p>
            <p className="hint">{owedToMe - iOwe > 0 ? "a receber" : owedToMe - iOwe < 0 ? "a pagar" : "tudo em dia"}</p>
          </div>
        </div>
      )}

      {ledger.people.length === 0 && (
        <div className="card section">
          <p className="debts-empty">
            <CheckCircle2 size={18} strokeWidth={1.7} aria-hidden /> Ninguém deve nada para você, e você não deve nada a ninguém.
          </p>
          <p className="faint" style={{ marginTop: 6 }}>
            Uma dívida aparece quando alguém paga algo e divide com outra pessoa, ou quando você registra um empréstimo.
          </p>
        </div>
      )}

      {ledger.people.map((p) => {
        const person = people.get(p.personId);
        const theyOwe = p.net > 0;
        return (
          <section key={p.personId} className="card section ledger" aria-labelledby={`dv-${p.personId}`}>
            <div className="ledger-head">
              <Avatar name={person?.name ?? "?"} color={person?.color ?? "#94A3B8"} size={40} />
              <div className="grow" style={{ minWidth: 0 }}>
                <h2 id={`dv-${p.personId}`}>{person?.name ?? "Alguém"}</h2>
                <p className={`ledger-net ${p.net > 0 ? "pos" : p.net < 0 ? "neg" : ""}`}>
                  {p.net === 0 ? "Vocês estão quites" : theyOwe ? <>Te deve <Money cents={p.net} currency={cur} /></> : <>Você deve <Money cents={-p.net} currency={cur} /></>}
                </p>
              </div>
              {p.net !== 0 && auth.participantId && (
                <Link
                  className="btn small"
                  data-tour="debts-pay"
                  href={`/transacoes/nova?acerto=${theyOwe ? p.personId : auth.participantId}.${theyOwe ? auth.participantId : p.personId}.${Math.abs(p.net)}`}
                >
                  Registrar pagamento
                </Link>
              )}
            </div>
            <div className="rows">
              {p.entries.map(({ tx, effect }) => {
                const series = seriesLabel(tx.seriesKind, tx.seriesIndex, tx.seriesTotal);
                const card = lookups.cards.find((c) => c.id === tx.cardId);
                return (
                  <div key={tx.id} className="row ledger-row">
                    <Link href={`/transacoes/${tx.id}`} className="grow" style={{ minWidth: 0 }}>
                      <p className="title">{tx.description}</p>
                      <p className="sub">
                        {formatDate(tx.date, { day: "2-digit", month: "short", year: "numeric" })} · {KIND[tx.kind] ?? tx.kind}
                        {tx.kind === "loan" || tx.kind === "transfer" ? ` · ${name(tx.payerId)} → ${name(tx.splits[0]?.participantId ?? null)}` : ` · pago por ${name(tx.payerId)}`}
                        {card ? ` · ${card.name}` : ""}
                        {series ? ` · ${series}` : ""}
                      </p>
                    </Link>
                    <span className={`amount ${effect > 0 ? "pos" : "neg"}`}>
                      <Money cents={effect} currency={cur} signed />
                    </span>
                    {settled && canEditTx(auth, tx.createdBy) && tx.kind !== "transfer" && (
                      <SettleButton id={tx.id} statusId={settled.id} label={tx.description} />
                    )}
                  </div>
                );
              })}
            </div>
            {p.upcomingCount > 0 && (
              <p className="ledger-upcoming">
                A vencer: <Money cents={Math.abs(p.upcoming)} currency={cur} /> em {p.upcomingCount}{" "}
                {p.upcomingCount === 1 ? "parcela futura" : "parcelas futuras"}
                {p.upcoming > 0 ? ` que ${person?.name} vai te dever` : " que você vai dever"}. Entram na dívida no mês de cada uma.
              </p>
            )}
            <p className="faint ledger-hint">
              <span className="pos">+</span> {person?.name} te deve · <span className="neg">−</span> você deve para {person?.name}. Pagamentos registrados já abatem.
            </p>
          </section>
        );
      })}

      {ledger.others.length > 0 && (
        <section className="card section" aria-labelledby="dv-outros">
          <h2 id="dv-outros" style={{ marginBottom: 8 }}>Entre as outras pessoas</h2>
          <div className="rows">
            {ledger.others.map((o) => (
              <div key={o.fromId + o.toId} className="row">
                <span className="debt-people" aria-hidden>
                  <Avatar name={name(o.fromId)} color={people.get(o.fromId)?.color ?? "#94A3B8"} size={28} />
                  <ArrowRight size={14} strokeWidth={1.8} />
                  <Avatar name={name(o.toId)} color={people.get(o.toId)?.color ?? "#94A3B8"} size={28} />
                </span>
                <p className="grow title">
                  <strong>{name(o.fromId)}</strong> deve para <strong>{name(o.toId)}</strong>
                </p>
                <span className="amount"><Money cents={o.amountCents} currency={cur} /></span>
                <Link className="btn small" href={`/transacoes/nova?acerto=${o.fromId}.${o.toId}.${o.amountCents}`}>
                  Registrar pagamento
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
