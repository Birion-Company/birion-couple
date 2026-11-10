import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Inbox, Plus, ScanSearch, Upload } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { TxRowLink } from "@/components/tx-row";
import { CategoryIcon, Money, formatDate } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { addMonthsKey, longMonth, monthsBetween, shortDate } from "@/lib/cards";
import { defaultPanelMonth, getInvoicesDue } from "@/lib/card-queries";
import { filtersToQuery, monthRange, MONTHS_AHEAD, parseFilters, thisMonthKey } from "@/lib/filters";
import { countUnidentified, getDashboard, getDebtLedger, getMonthDebts, getLookupsFor, getOutlook } from "@/lib/queries";
import { MoneySummary } from "@/components/money-summary";
import { MonthNav } from "@/components/month-nav";
import { MonthOutlook } from "@/components/month-outlook";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage({ searchParams }: PageProps<"/painel">) {
  const auth = await requireAuth();
  const sp = await searchParams;
  // O painel mostra um mês por vez (o atual, se não escolher outro), até 12 meses à frente.
  // O mês é o do pagamento (no cartão, o mês em que a fatura vence). O painel abre na fatura que falta pagar.
  // Tudo o que não depende de outra consulta vai junto, em paralelo.
  const [current, lookups] = await Promise.all([defaultPanelMonth(auth), getLookupsFor(auth)]);
  const parsed = parseFilters(sp, "mes");
  const month = parsed.month ?? current;
  const filters = { ...parsed, period: "mes" as const, month: month === current ? null : month, competence: month, ...monthRange(month) };
  const [data, toIdentify, outlook, invoices, ledger] = await Promise.all([
    getDashboard(auth, filters),
    countUnidentified(auth),
    getOutlook(auth, filters),
    getInvoicesDue(auth, month, filters.person, filters.everyone),
    // Para o resumo: o total que te devem e que você deve (todas as dívidas em aberto, não só do mês).
    getDebtLedger(auth, lookups),
  ]);
  // Mês à frente: estimativa só com o que é daquele mês (o de antes, imagina-se, já foi pago).
  const ahead = month > current;
  const debts = ahead ? await getMonthDebts(auth, month) : ledger.people.map((p) => ({ id: p.personId, net: p.net }));
  const diff = monthsBetween(current, month);
  const invoicesTotal = invoices.reduce((a, v) => a + v.totalCents, 0);
  const balance = data.income - data.spent;
  const monthName = longMonth(month).replace(/ de \d{4}$/, "").toLowerCase();
  const cur = auth.currency;

  const people = new Map(lookups.participants.map((p) => [p.id, p]));
  const cats = new Map(lookups.categories.map((c) => [c.id, c]));
  const firstName = auth.userName.split(" ")[0];
  const me = auth.participantId;
  // De quem são os números: você (padrão), outra pessoa (filtro) ou a família inteira ("Todos").
  const mode: "me" | "other" | "all" = !data.focus ? "all" : data.focus === me ? "me" : "other";
  const focus = mode === "other" ? people.get(data.focus!) ?? null : null;
  // Outra pessoa: quanto ela te deve (ou você deve a ela), somando todas as dívidas entre vocês.

  const nameOf = (id: string) => people.get(id)?.name ?? "Alguém";
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.cents));
  // Dívidas que envolvem você primeiro.
  const welcome = sp.bemvindo === "1";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Olá, {firstName}</h1>
          <p className="muted">
            {mode === "other" ? `Vendo ${focus?.name}` : mode === "all" ? "A família inteira" : "Seu resumo do mês"}
          </p>
        </div>
      </div>

      <MonthNav
        filters={filters}
        month={month}
        current={current}
        max={addMonthsKey(thisMonthKey(), MONTHS_AHEAD)}
        hasCards={lookups.cards.some((c) => !c.archived)}
        detail={
          invoices.length
            ? invoices.map((v) => `${invoices.length > 1 ? `${v.cardName} ` : ""}vence ${shortDate(v.due)}${v.paid ? " · paga" : ""}`).join(" · ") + " · mais o que não foi no cartão"
            : null
        }
      />

      {welcome && (
        <div className="notice" style={{ marginBottom: 16 }}>
          Conta criada. Próximos passos: cadastre as pessoas em <Link href="/ajustes/pessoas" className="pos">Ajustes → Pessoas</Link>,
          depois registre um gasto ou importe um extrato. Categorias e projetos também são editáveis em Ajustes.
        </div>
      )}

      {toIdentify > 0 && (
        <Link href="/identificar" className="identify-banner">
          <ScanSearch size={20} strokeWidth={1.7} aria-hidden />
          <span className="grow">
            <strong>
              {toIdentify} {toIdentify === 1 ? "lançamento" : "lançamentos"} a identificar
            </strong>
            <span className="faint"> · falta dizer a categoria, quem pagou ou quem deveria pagar</span>
          </span>
          <span className="identify-go">
            Identificar <ArrowRight size={14} style={{ verticalAlign: -2 }} />
          </span>
        </Link>
      )}


      <div data-tour="dash-filters">
      <FilterBar
        filters={filters}
        participants={lookups.participants}
        categories={lookups.categories}
        projects={lookups.projects}
        cards={lookups.cards}
        defaultPeriod="mes"
        showPeriod={false}
        defaultPerson={me}
      />
      </div>

      {diff > 0 && (
        <div className="notice future-notice">
          <strong>Previsão:</strong> só parcelas e contas fixas já lançadas para {monthName}.
        </div>
      )}

      {mode === "me" ? (
        <>
          <MoneySummary
            owedToMe={debts.filter((p) => p.net > 0).map((p) => ({ id: p.id, cents: p.net }))}
            iOwe={debts.filter((p) => p.net < 0).map((p) => ({ id: p.id, cents: -p.net }))}
            estimate={ahead}
            invoices={invoices}
            hasCard={lookups.cards.some((c) => !c.archived && c.ownerId === me)}
            monthName={monthName}
            name={nameOf}
            currency={cur}
          />
        </>
      ) : (
      <div className="stats stats-4 dash-stats">
        <div className="stat">
          <p className="label">{mode === "other" ? `Gastos de ${focus?.name} no mês` : mode === "all" ? "Gastos da família" : diff > 0 ? "Já comprometido" : "Seus gastos"}</p>
          <p className="value"><Money cents={data.spent} currency={cur} /></p>
          <p className="hint">
            {mode === "all" ? "todas as despesas" : data.familySpent !== data.spent ? <>de <Money cents={data.familySpent} currency={cur} /> no total</> : mode === "other" ? "parte dela(e)" : "sua parte"}
          </p>
        </div>

        {mode === "other" ? (
          <>
            <div className="stat">
              <p className="label">Você pagou por {focus?.name}</p>
              <p className="value"><Money cents={data.paidByMeForFocus} currency={cur} /></p>
              <p className="hint">neste mês</p>
            </div>
            <div className="stat">
              <p className="label">{focus?.name} te pagou</p>
              <p className="value pos"><Money cents={data.repaidToMe} currency={cur} /></p>
              <p className="hint">neste mês</p>
            </div>
            <Link className="stat" href="/dividas">
              <p className="label">Falta {focus?.name} pagar</p>
              <p className={`value ${data.stillOwesMe > 0 ? "pos" : ""}`}><Money cents={data.stillOwesMe} currency={cur} /></p>
              <p className="hint">deste mês · o total fica em Dívidas</p>
            </Link>
          </>
        ) : (
          <>
            <Link className="stat" href="/dividas">
              <p className="label">{mode === "all" ? "A acertar entre vocês" : "Devem a você"}</p>
              <p className="value pos"><Money cents={data.paidForOthers} currency={cur} /></p>
              <p className="hint">
                {data.owedToMe.length === 0
                  ? "ninguém deve nada deste mês"
                  : data.owedToMe.slice(0, 2).map((o, k) => (
                      <span key={o.id}>
                        {k > 0 ? " · " : ""}
                        {nameOf(o.id)} <Money cents={o.cents} currency={cur} />
                      </span>
                    ))}
                {data.owedToMe.length > 2 ? ` · +${data.owedToMe.length - 2}` : ""}
              </p>
            </Link>
            <Link className="stat" href="/cartoes">
              <p className="label">Fatura{invoices.length > 1 ? "s" : ""} do mês</p>
              <p className="value"><Money cents={invoicesTotal} currency={cur} /></p>
              <p className="hint">
                {invoices.length === 0
                  ? "nenhuma"
                  : invoices.map((v, k) => (
                      <span key={v.cardId + v.key}>
                        {k > 0 ? " · " : ""}
                        {invoices.length > 1 ? `${v.cardName} ` : ""}
                        {v.paid ? "paga" : `vence ${shortDate(v.due)}`}
                      </span>
                    ))}
              </p>
            </Link>
            <div className="stat">
              <p className="label">{diff > 0 ? "Saldo previsto" : "Saldo"}</p>
              <p className={`value ${balance < 0 ? "neg" : balance > 0 ? "pos" : ""}`}>
                <Money cents={balance} currency={cur} signed />
              </p>
              <p className="hint">
                entradas <Money cents={data.income} currency={cur} /> − gastos
              </p>
            </div>
          </>
        )}
      </div>
      )}

      <MonthOutlook months={outlook} selected={month} current={current} filters={filters} currency={cur} />

      {diff > 0 ? (
        <section className="card section" aria-labelledby="plan">
          <div className="card-head">
            <h2 id="plan">Já lançado para {monthName}</h2>
          </div>
          {data.planned.length === 0 ? (
            <div className="empty">Nada lançado para esse mês ainda.</div>
          ) : (
            <div className="rows">
              {data.planned.map((t) =>
                t.source === "projetado" ? (
                  <div key={t.id} className="row tx-row projected-row">
                    <CategoryIcon icon={cats.get(t.categoryId ?? "")?.icon} color={cats.get(t.categoryId ?? "")?.color} size={30} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <p className="title">
                        {t.description} <span className="tx-tag recurring">conta fixa</span>
                      </p>
                      <p className="sub">{formatDate(t.date)} · conta fixa · entra sozinha</p>
                    </div>
                    <div className="amount"><Money cents={t.amountCents} currency={cur} className={t.kind === "income" ? "pos" : ""} /></div>
                  </div>
                ) : (
                  <TxRowLink key={t.id} tx={t} lookups={lookups} currency={cur} me={me} />
                ),
              )}
            </div>
          )}
        </section>
      ) : data.count === 0 ? (
        <div className="card section">
          <div className="empty">
            <Inbox size={36} strokeWidth={1.2} />
            <p>Nenhum lançamento por aqui ainda.</p>
            <div className="actions" style={{ justifyContent: "center", marginTop: 14 }}>
              <Link className="btn primary" href="/transacoes/nova"><Plus size={16} /> Novo lançamento</Link>
              <Link className="btn" href="/ajustes/importacao"><Upload size={16} strokeWidth={1.6} /> Importar extrato</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid dash-bottom section">
          <section className="card" aria-labelledby="recent">
            <div className="card-head">
              <h2 id="recent">Últimos lançamentos de {monthName}</h2>
              <Link href={`/transacoes${filtersToQuery({ ...filters, month: month })}`}>
                Ver todos <ArrowRight size={13} style={{ verticalAlign: -2 }} />
              </Link>
            </div>
            <div className="rows">
              {data.recent.map((t) => (
                <TxRowLink key={t.id} tx={t} lookups={lookups} currency={cur} me={me} />
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="cats">
            <div className="card-head">
              <h2 id="cats">Gastos por categoria</h2>
              {/* O total do mês fica aqui, junto da divisão por categoria (sem repetir no topo). */}
              <span className="faint num">
                <Money cents={data.spent} currency={cur} /> {mode === "me" ? "sua parte" : "no mês"}
              </span>
            </div>
            {data.byCategory.length === 0 ? (
              <div className="empty">Sem despesas no filtro atual.</div>
            ) : (
              <div className="rows">
                {data.byCategory.slice(0, 8).map((c) => {
                  const cat = cats.get(c.id);
                  const color = cat?.color ?? "#CBD5E1";
                  return (
                    <Link key={c.id} href={`/transacoes${filtersToQuery({ ...filters, category: c.id })}`} className="row" style={{ display: "block" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <CategoryIcon icon={cat?.icon} color={color} size={26} />
                        <span className="grow title">{cat?.name ?? "Sem categoria"}</span>
                        <span className="amount"><Money cents={c.cents} currency={cur} /></span>
                        <span className="faint num" style={{ width: 40, textAlign: "right" }}>
                          {Math.round((c.cents / Math.max(1, data.spent)) * 100)}%
                        </span>
                      </div>
                      <div className="bar"><span style={{ width: `${(c.cents / maxCat) * 100}%`, background: color }} /></div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      )}
    </>
  );
}
