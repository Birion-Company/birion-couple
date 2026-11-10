import Link from "next/link";
import { CheckCircle2, HandCoins } from "lucide-react";
import { DebtLines, type DebtLine } from "./debt-lines";
import { ProfitBadge, UndoButton } from "./debt-payments";
import { Avatar, Money, formatDate } from "./ui";
import type { Lookups, LedgerPerson } from "@/lib/queries";

type Ledger = { people: LedgerPerson[]; others: DebtLine[] };

/**
 * Dívidas dentro de Lançamentos (antes era uma página própria).
 * - Sem pessoa escolhida: "Quem deve para quem" (todas as dívidas em aberto, por par de pessoas).
 * - Com uma pessoa: o saldo com ela, "Registrar pagamento do total" e o histórico do que ela já pagou.
 */
export function DebtsPanel({ ledger, lookups, me, person, currency }: { ledger: Ledger; lookups: Lookups; me: string | null; person: string | null; currency: string }) {
  const people = new Map(lookups.participants.map((p) => [p.id, p]));
  const name = (id: string) => (id === me ? "Você" : people.get(id)?.name ?? "Alguém");

  if (person && person !== me) {
    const p = ledger.people.find((x) => x.personId === person);
    const who = people.get(person);
    const net = p?.net ?? 0;
    const theyOwe = net > 0;
    return (
      <section className="card section debts-person" aria-label={`Saldo com ${name(person)}`} data-tour="debts">
        <div className="debts-person-head">
          <Avatar name={who?.name ?? "?"} color={who?.color ?? "#94A3B8"} size={40} src={who?.avatarUrl ?? null} />
          <div className="grow">
            <p className="faint">Saldo com {name(person)}</p>
            <p className={`debts-person-net ${net > 0 ? "pos" : net < 0 ? "neg" : ""}`}>
              {net === 0 ? (
                "Quites"
              ) : theyOwe ? (
                <>
                  {name(person)} te deve <Money cents={net} currency={currency} />
                </>
              ) : (
                <>
                  Você deve <Money cents={-net} currency={currency} />
                </>
              )}
            </p>
            {(p?.upcomingCount ?? 0) > 0 && (
              <p className="faint">
                + {p!.upcomingCount} a vencer (<Money cents={Math.abs(p!.upcoming)} currency={currency} />)
              </p>
            )}
          </div>
          {net !== 0 && me && (
            <Link className="btn small" href={`/transacoes/nova?acerto=${theyOwe ? person : me}.${theyOwe ? me : person}.${Math.abs(net)}`}>
              <HandCoins size={15} strokeWidth={1.8} /> Registrar pagamento do total
            </Link>
          )}
        </div>
        {p && p.paid.length > 0 && (
          <details className="ledger-paid debts-person-paid">
            <summary>
              Já pago: {p.paid.length} {p.paid.length === 1 ? "registro" : "registros"}
            </summary>
            <div className="rows">
              {p.paid.map((x) => (
                <div key={x.key} className="row ledger-row paid">
                  <Link href={`/transacoes/${x.tx.id}`} className="grow" style={{ minWidth: 0 }}>
                    <span className="title" style={{ display: "block" }}>
                      {x.tx.description}
                    </span>
                    <span className="sub" style={{ display: "block" }}>
                      {formatDate(x.tx.date, { day: "2-digit", month: "short" })} ·{" "}
                      {x.how === "acerto" ? (x.cents > 0 ? `${name(person)} te pagou (acerto)` : `você pagou a ${name(person)} (acerto)`) : x.how === "coberta" ? "paga pelo acerto" : x.cents > 0 ? "recebido" : "pago"}
                    </span>
                  </Link>
                  <span className="amount">
                    <Money cents={Math.abs(x.cents)} currency={currency} />
                    {x.owedCents !== undefined && Math.abs(x.cents) !== x.owedCents ? (
                      <ProfitBadge paidCents={Math.abs(x.cents)} owedCents={x.owedCents} restCents={x.leftCents} currency={currency} />
                    ) : null}
                  </span>
                  {x.undoId && <UndoButton payId={x.undoId} />}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    );
  }

  // Quem deve para quem: as dívidas que envolvem você primeiro (e, para quem administra, as dos outros).
  const lines: DebtLine[] = [
    ...ledger.people
      .filter((p) => p.net !== 0 && me)
      .map((p) => (p.net > 0 ? { fromId: p.personId, toId: me!, amountCents: p.net } : { fromId: me!, toId: p.personId, amountCents: -p.net })),
    ...ledger.others,
  ];
  return (
    <section className="card section debts" aria-labelledby="quem-deve" data-tour="debts">
      <div className="card-head">
        <h2 id="quem-deve">Quem deve para quem</h2>
        <span className="faint">todos os meses</span>
      </div>
      {lines.length === 0 ? (
        <p className="debts-empty">
          <CheckCircle2 size={18} strokeWidth={1.7} aria-hidden /> Ninguém deve nada a ninguém.
        </p>
      ) : (
        <DebtLines
          lines={lines}
          me={me}
          people={Object.fromEntries(lookups.participants.map((x) => [x.id, { name: x.name, color: x.color, avatarUrl: x.avatarUrl ?? null }]))}
          currency={currency}
        />
      )}
      <p className="faint debts-tip">Toque numa pessoa (filtro Pessoa) para ver o saldo com ela e o que ela já pagou.</p>
    </section>
  );
}
