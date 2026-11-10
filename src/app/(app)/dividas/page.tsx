import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronDown, HandCoins } from "lucide-react";
import { PayButton, ProfitBadge, UndoButton } from "@/components/debt-payments";
import { Avatar, Money, formatDate } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { addMonthsKey, competenceMonth, longMonth, seriesLabel } from "@/lib/cards";
import { closingDays, getDebtLedger, getLookupsFor, householdStartMonth } from "@/lib/queries";
import { DebtLines } from "@/components/debt-lines";
import { MonthNav } from "@/components/month-nav";
import { MONTHS_AHEAD, parseFilters, thisMonthKey } from "@/lib/filters";

export const metadata: Metadata = { title: "Dívidas" };

const KIND: Record<string, string> = { expense: "despesa dividida", income: "receita dividida", loan: "dívida", transfer: "pagamento" };

export default async function DebtsPage({ searchParams }: PageProps<"/dividas">) {
  const auth = await requireAuth();
  const lookups = await getLookupsFor(auth);
  const [full, closing] = await Promise.all([getDebtLedger(auth, lookups), closingDays(auth.householdId)]);
  const cur = auth.currency;
  const people = new Map(lookups.participants.map((p) => [p.id, p]));
  const name = (id: string | null) => (id ? people.get(id)?.name ?? "Alguém" : "ninguém");
  const me = auth.participantId;

  // Mês de cada dívida: no cartão, o mês da fatura (como no painel).
  const monthOf = (tx: { date: string; cardId: string | null }) => competenceMonth(tx.date, tx.cardId ? closing.get(tx.cardId) : null);
  // Mesmo navegador do painel: um mês por vez, do primeiro mês de uso até 12 meses à frente.
  const sp = await searchParams;
  const current = thisMonthKey();
  const started = await householdStartMonth(auth.householdId);
  const firstMonth = started < current ? started : current;
  const lastMonth = addMonthsKey(current, MONTHS_AHEAD);
  const raw = typeof sp.mes === "string" ? sp.mes : null;
  const month = raw && raw >= firstMonth && raw <= lastMonth ? raw : current;
  // Este mês: tudo o que está em aberto até agora (e as parcelas a vencer embaixo).
  // Outro mês: só o que é daquele mês.
  const ledger =
    month === current
      ? full
      : {
          ...full,
          people: full.people
            .map((p) => {
              const entries = [...p.entries, ...p.upcomingEntries].filter((e) => monthOf(e.tx) === month);
              return { ...p, entries, net: entries.reduce((a, e) => a + e.effect, 0), upcoming: 0, upcomingCount: 0, upcomingEntries: [] };
            })
            .filter((p) => p.entries.length > 0),
        };
  const owedToMe = ledger.people.filter((p) => p.net > 0).reduce((a, p) => a + p.net, 0);
  const iOwe = ledger.people.filter((p) => p.net < 0).reduce((a, p) => a - p.net, 0);
  const monthWord = month !== current ? ` em ${longMonth(month).replace(/ de \d{4}$/, "").toLowerCase()}` : "";

  // "Quem deve para quem" (o total, sem filtro de mês): as dívidas que envolvem você primeiro.
  // Só dívidas reais entre cada par de pessoas (sem "simplificar" passando por quem não tem nada a ver).
  const debtLines = [
    ...full.people
      .filter((p) => p.net !== 0 && me)
      .map((p) => (p.net > 0 ? { fromId: p.personId, toId: me!, amountCents: p.net } : { fromId: me!, toId: p.personId, amountCents: -p.net })),
    ...full.others,
  ];

  return (
    <div className="debts-page">
      <div className="page-head">
        <div>
          <h1>Dívidas</h1>
          <p className="muted">Quem te deve, quanto e de onde veio.</p>
        </div>
        <Link className="btn primary" href="/transacoes/nova?tipo=emprestimo">
          <HandCoins size={16} strokeWidth={1.7} /> Registrar dívida
        </Link>
      </div>

      <section className="card debts" aria-labelledby="quem-deve" data-tour="dash-debts">
        <div className="card-head">
          <h2 id="quem-deve">Quem deve para quem</h2>
          <span className="faint">no total</span>
        </div>
        {debtLines.length === 0 ? (
          <p className="debts-empty">
            <CheckCircle2 size={18} strokeWidth={1.7} aria-hidden /> Ninguém deve nada a ninguém.
          </p>
        ) : (
          <DebtLines
            lines={debtLines}
            me={me}
            people={Object.fromEntries(lookups.participants.map((p) => [p.id, { name: p.name, color: p.color, avatarUrl: p.avatarUrl ?? null }]))}
            currency={cur}
          />
        )}
      </section>

      <MonthNav filters={parseFilters(sp, "mes")} month={month} current={current} min={firstMonth} max={lastMonth} />

      {auth.participantId && (
        <div className="stats debts-stats" data-tour="debts">
          <div className="stat">
            <p className="label">Te devem{monthWord}</p>
            <p className="value pos"><Money cents={owedToMe} currency={cur} /></p>
            <p className="hint">{ledger.people.filter((p) => p.net > 0).length} pessoa(s)</p>
          </div>
          <div className="stat">
            <p className="label">Você deve{monthWord}</p>
            <p className="value neg"><Money cents={iOwe} currency={cur} /></p>
            <p className="hint">{ledger.people.filter((p) => p.net < 0).length} pessoa(s)</p>
          </div>
          <div className="stat">
            <p className="label">Saldo{monthWord}</p>
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
            Aparece quando alguém paga e divide, ou ao registrar uma dívida.
          </p>
        </div>
      )}

      {ledger.people.map((p) => {
        const person = people.get(p.personId);
        const theyOwe = p.net > 0;
        return (
          <details key={p.personId} className="card section ledger" open={ledger.people.length === 1}>
            <summary className="ledger-head">
              <Avatar name={person?.name ?? "?"} color={person?.color ?? "#94A3B8"} size={40} src={person?.avatarUrl} />
              <div className="grow" style={{ minWidth: 0 }}>
                <h2 id={`dv-${p.personId}`}>
                  {person?.name ?? "Alguém"}
                </h2>
                <p className="faint ledger-count">
                  {p.entries.length} {p.entries.length === 1 ? "lançamento em aberto" : "lançamentos em aberto"}
                  {p.upcomingCount > 0 ? ` · ${p.upcomingCount} a vencer` : ""}
                </p>
              </div>
              <p className={`ledger-net ${p.net > 0 ? "pos" : p.net < 0 ? "neg" : ""}`}>
                {p.net === 0 ? "Quites" : theyOwe ? <>Te deve <Money cents={p.net} currency={cur} /></> : <>Você deve <Money cents={-p.net} currency={cur} /></>}
              </p>
              <ChevronDown size={18} strokeWidth={1.8} className="impact-chevron" aria-hidden />
            </summary>
            {p.net !== 0 && auth.participantId && (
              <div className="ledger-actions">
                <Link
                  className="btn small"
                  data-tour="debts-pay"
                  href={`/transacoes/nova?acerto=${theyOwe ? p.personId : auth.participantId}.${theyOwe ? auth.participantId : p.personId}.${Math.abs(p.net)}`}
                >
                  Registrar pagamento do total
                </Link>
              </div>
            )}
            <div className="rows">
              {p.entries.map(({ tx, effect, covered }) => {
                const series = seriesLabel(tx.seriesKind, tx.seriesIndex, tx.seriesTotal);
                // Parte já coberta por um acerto: mostra só o que falta.
                const left = Math.sign(effect) * (Math.abs(effect) - (covered ?? 0));
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
                    <span className={`amount ${left > 0 ? "pos" : "neg"}`}>
                      {/* Já pagou uma parte: o valor original riscado, ao lado do que falta. */}
                      {(() => {
                        const sp = tx.splits.find((x) => (x.participantId === p.personId || x.participantId === auth.participantId) && x.participantId !== tx.payerId && x.partCents);
                        return sp ? (
                          <s className="was" title="Valor original">
                            <Money cents={sp.amountCents} currency={cur} />
                          </s>
                        ) : null;
                      })()}{" "}
                      <Money cents={left} currency={cur} signed />
                      {covered ? <span className="sub" style={{ display: "block" }}>falta, de <Money cents={Math.abs(effect)} currency={cur} /></span> : null}
                    </span>
                    {tx.kind !== "transfer" && tx.splits.some((x) => x.pendingPayId && (x.participantId === p.personId || x.participantId === auth.participantId)) ? (
                      <Link className="btn small ghost" href={`/transacoes/${tx.splits.find((x) => x.pendingPayId)!.pendingPayId}`}>
                        Esperando confirmar
                      </Link>
                    ) : tx.kind !== "transfer" && (
                      <PayButton
                        txId={tx.id}
                        participantId={tx.payerId === auth.participantId ? p.personId : auth.participantId!}
                        owedCents={Math.abs(left)}
                        currency={cur}
                        label={effect > 0 ? "Recebi" : "Paguei"}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {p.paid.length > 0 && (
              <details className="ledger-upcoming ledger-paid">
                <summary>
                  Já pago: {p.paid.length} {p.paid.length === 1 ? "registro" : "registros"}
                </summary>
                <div className="rows">
                  {p.paid.map((x) => (
                    <div key={x.key} className="row ledger-row paid">
                      <Link href={`/transacoes/${x.tx.id}`} className="grow" style={{ minWidth: 0 }}>
                        <span className="title" style={{ display: "block" }}>{x.tx.description}</span>
                        <span className="sub" style={{ display: "block" }}>
                          {formatDate(x.tx.date, { day: "2-digit", month: "short" })} ·{" "}
                          {x.how === "acerto" ? (x.cents > 0 ? `${person?.name} te pagou (acerto)` : `você pagou a ${person?.name} (acerto)`) : x.how === "coberta" ? "paga pelo acerto" : x.cents > 0 ? "recebido" : "pago"}
                        </span>
                      </Link>
                      <span className="amount">
                        <Money cents={Math.abs(x.cents)} currency={cur} />
                        {x.owedCents !== undefined && Math.abs(x.cents) !== x.owedCents ? (
                          <ProfitBadge paidCents={Math.abs(x.cents)} owedCents={x.owedCents} restCents={x.leftCents} currency={cur} />
                        ) : null}
                      </span>
                      {x.undoId && <UndoButton payId={x.undoId} />}
                    </div>
                  ))}
                </div>
              </details>
            )}
            {p.upcomingCount > 0 && (
              <details className="ledger-upcoming">
                <summary>
                  Mais <Money cents={Math.abs(p.upcoming)} currency={cur} /> em {p.upcomingCount} {p.upcomingCount === 1 ? "parcela" : "parcelas"} a vencer
                </summary>
                <div className="rows">
                  {[...p.upcomingEntries]
                    .sort((a, b) => (a.tx.date < b.tx.date ? -1 : 1))
                    .map(({ tx, effect }) => (
                      <Link key={tx.id} href={`/transacoes/${tx.id}`} className="row ledger-row upcoming">
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="title">{tx.description}</span>
                          <span className="sub">
                            vence {formatDate(tx.date, { day: "2-digit", month: "short", year: "numeric" })}
                            {seriesLabel(tx.seriesKind, tx.seriesIndex, tx.seriesTotal) ? ` · ${seriesLabel(tx.seriesKind, tx.seriesIndex, tx.seriesTotal)}` : ""}
                          </span>
                        </span>
                        <span className={`amount ${effect > 0 ? "pos" : "neg"}`}>
                          <Money cents={effect} currency={cur} signed />
                        </span>
                      </Link>
                    ))}
                </div>
              </details>
            )}
          </details>
        );
      })}

    </div>
  );
}
