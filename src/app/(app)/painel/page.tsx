import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Inbox, Plus, ScanSearch, Upload } from "lucide-react";
import { GoalRing } from "@/components/goal-ring";
import { MonthStatement } from "@/components/month-statement";
import { DashBoard } from "@/components/dash-board";
import { FilterBar } from "@/components/filter-bar";
import { TxRowLink } from "@/components/tx-row";
import { CategoryIcon, Money, formatDate } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { longMonth, monthsBetween, shortDate, todayIn } from "@/lib/cards";
import { defaultPanelMonth, getInvoicesDue } from "@/lib/card-queries";
import { filtersToQuery, monthRange, parseFilters } from "@/lib/filters";
import { countUnidentified, getDashboard, getAwaitingIncome, getDebtLedger, getDebtsToReceive, getMonthDebts, navigableMonths, getLookupsFor, getOutlook, monthCarry } from "@/lib/queries";
import { MoneySummary } from "@/components/money-summary";
import { AwaitingIncome } from "@/components/awaiting-income";
import { BudgetBar } from "@/components/budget-editor";
import { getBudgets } from "@/lib/budgets";
import { goalPlan } from "@/lib/goals";
import { position } from "@/lib/position";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatMoney } from "@/lib/money";
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
  // Do primeiro mês de uso até o último mês com algo lançado (ex.: a última parcela do celular).
  const { first: firstMonth, last: lastMonth } = await navigableMonths(auth.householdId, current);
  const parsed = parseFilters(sp, "mes");
  // Fora do período (antes de usar o app ou depois do último mês com algo lançado): volta para o mês atual.
  const month = parsed.month && parsed.month >= firstMonth && parsed.month <= lastMonth ? parsed.month : current;
  const filters = { ...parsed, period: "mes" as const, month: month === current ? null : month, competence: month, ...monthRange(month) };
  const [data, toIdentify, outlook, invoices, ledger, awaiting, debtsDue] = await Promise.all([
    getDashboard(auth, filters),
    countUnidentified(auth),
    getOutlook(auth, filters),
    getInvoicesDue(auth, month, filters.person, filters.everyone),
    // Para o resumo: o total que te devem e que você deve (todas as dívidas em aberto, não só do mês).
    getDebtLedger(auth, lookups),
    // Receitas que ainda não caíram (até o fim do mês visto; as atrasadas também).
    getAwaitingIncome(auth, monthRange(month).to),
    // Dívidas a seu favor que vencem até o fim do mês visto (as atrasadas também).
    getDebtsToReceive(auth, monthRange(month).to),
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
  // Orçamento: só quando se olha o próprio mês (o gasto de data.byCategory já é a parte da pessoa).
  const spentOf = new Map(data.byCategory.map((c) => [c.id, c.cents]));
  const budgetRows = (await getBudgets(auth.userId))
    .map((b) => ({ categoryId: b.categoryId, limit: b.monthlyCents, spent: spentOf.get(b.categoryId) ?? 0 }))
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);
  const goalRows = (await getDb().select().from(schema.goals).where(eq(schema.goals.userId, auth.userId)).orderBy(asc(schema.goals.targetMonth))).map((g) => ({
    ...g,
    plan: goalPlan(g.targetCents, g.savedCents, g.targetMonth, current),
  }));
  // Sem contas: a posição é só o que há para pagar (faturas e dívidas) e o que há para receber.
  const pos = position({
    accountsCents: [],
    invoices: invoices.map((v) => ({ mineCents: v.mineCents, paid: v.paid, due: v.due })),
    debts: debts.map((d) => ({ net: d.net })),
    receivableMonthCents: debtsDue.reduce((a, x) => a + x.leftCents, 0),
  });
  const carry = mode === "me" ? await monthCarry(auth, month) : 0;
  // Contas fixas ainda sem lançamento no mês: levam ao último lançamento da mesma série, que se edita ("esta e as próximas").
  const fixedSeries = [...new Set(data.planned.filter((t) => t.source === "projetado" && t.seriesId).map((t) => t.seriesId!))];
  const editIds = new Map<string, string>();
  if (fixedSeries.length > 0) {
    const found = await getDb()
      .select({ seriesId: schema.transactions.seriesId, id: schema.transactions.id })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.seriesId, fixedSeries)))
      .orderBy(desc(schema.transactions.date));
    // Do mais recente para o mais antigo: o primeiro de cada série é o último lançamento dela.
    for (const f of found) if (f.seriesId && !editIds.has(f.seriesId)) editIds.set(f.seriesId, f.id);
  }
  // Dívidas que envolvem você primeiro.
  const welcome = sp.bemvindo === "1";

  return (
    <>
      {mode === "me" && diff <= 0 ? (
        <section className="month-hero" aria-label={`Resumo de ${monthName}`}>
          <p className="hero-hello rise" style={{ "--i": 0 } as React.CSSProperties}>Olá, {firstName}</p>
          <h1 className="hero-title rise" style={{ "--i": 1 } as React.CSSProperties}>Seu resumo de {monthName}</h1>
          <MonthStatement
            monthName={monthName}
            currency={cur}
            input={{ initialCents: carry, incomeCents: data.income, spentCents: data.spent, owedToMeCents: data.paidForOthers, iOweCents: data.iOweMonth }}
          />
        </section>
      ) : (
      <div className="page-head">
        <div>
          <h1>Olá, {firstName}</h1>
          <p className="muted">
            {mode === "other" ? `Vendo ${focus?.name}` : mode === "all" ? "Os dois juntos" : "Seu resumo do mês"}
          </p>
        </div>
      </div>
      )}

      <MonthNav
        filters={filters}
        month={month}
        current={current}
        min={firstMonth}
        max={lastMonth}
        hasCards={lookups.cards.some((c) => !c.archived)}
        detail={
          invoices.length
            ? invoices.map((v) => `${invoices.length > 1 ? `${v.cardName} ` : ""}vence ${shortDate(v.due)}${v.paid ? " · paga" : ""}`).join(" · ") + " · mais o que não foi no cartão"
            : null
        }
      />

      {welcome && (
        <div className="notice" style={{ marginBottom: 16 }}>
          Conta criada. Próximo passo: convide o seu par em <Link href="/ajustes" className="pos">Ajustes → Nós</Link>,
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

      <AwaitingIncome month={month} items={awaiting} debts={debtsDue} names={Object.fromEntries(lookups.participants.map((p) => [p.id, p.name]))} today={todayIn()} currency={cur} />

      <DashBoard
        blocks={[
          {
            id: "resumo",
            label: "Resumo",
            size: "wide",
            node: (
              <>
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
          <p className="label">{mode === "other" ? `Gastos de ${focus?.name} no mês` : mode === "all" ? "Gastos dos dois" : diff > 0 ? "Já comprometido" : "Seus gastos"}</p>
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
            <Link className="stat" href="/transacoes?dividas=1">
              <p className="label">Falta {focus?.name} pagar</p>
              <p className={`value ${data.stillOwesMe > 0 ? "pos" : ""}`}><Money cents={data.stillOwesMe} currency={cur} /></p>
              <p className="hint">deste mês · o total fica em Dívidas</p>
            </Link>
          </>
        ) : (
          <>
            <Link className="stat" href="/transacoes?dividas=1">
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
              </>
            ),
          },
          { id: "meses", label: "Próximos meses", size: "wide", node: <MonthOutlook months={outlook} selected={month} current={current} filters={filters} currency={cur} /> },
          ...(diff > 0
            ? [
                {
                  id: "plan",
                  label: "Já lançado",
                  size: "wide" as const,
                  node: (
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
                  <Link key={t.id} href={editIds.get(t.seriesId ?? "") ? `/transacoes/${editIds.get(t.seriesId ?? "")}` : "/transacoes"} className="row tx-row projected-row" title="Editar esta conta fixa (vale para esta e as próximas)">
                    <CategoryIcon icon={cats.get(t.categoryId ?? "")?.icon} color={cats.get(t.categoryId ?? "")?.color} size={30} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <p className="title">
                        <span className={t.kind === "expense" ? "neg" : ""}>{t.description}</span> <span className="tx-tag recurring">conta fixa</span>
                      </p>
                      <p className="sub">{formatDate(t.date)} · conta fixa · toque para editar</p>
                    </div>
                    <div className="amount"><Money cents={t.amountCents} currency={cur} className={t.kind === "income" ? "pos" : t.kind === "expense" ? "neg" : ""} /></div>
                  </Link>
                ) : (
                  <TxRowLink key={t.id} tx={t} lookups={lookups} currency={cur} me={me} />
                ),
              )}
            </div>
          )}
        </section>
                  ),
                },
              ]
            : data.count === 0
              ? [
                  {
                    id: "vazio",
                    label: "Começar",
                    size: "wide" as const,
                    node: (
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
                    ),
                  },
                ]
              : [
                  {
                    id: "recent",
                    label: "Últimos lançamentos",
                    size: "card" as const,
                    node: (
          <section className="card" aria-labelledby="recent" data-tour="dash-recent">
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
                    ),
                  },
                  ...(mode === "me" && budgetRows.length > 0
                    ? [
                        {
                          id: "orc",
                          label: "Orçamento",
                          size: "card" as const,
                          node: (
            <section className="card static-layout" aria-labelledby="orc">
              <div className="card-head">
                <h2 id="orc">Orçamento do mês</h2>
                <Link href="/ajustes/categorias" className="faint">
                  ajustar
                </Link>
              </div>
              <div className="rows">
                {budgetRows.map((b) => {
                  const cat = cats.get(b.categoryId);
                  return (
                    <Link key={b.categoryId} href={`/transacoes${filtersToQuery({ ...filters, category: b.categoryId })}`} className="row" style={{ display: "block" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <CategoryIcon icon={cat?.icon} color={cat?.color ?? "#CBD5E1"} size={26} />
                        <span className="grow title">{cat?.name ?? "Categoria"}</span>
                        <span className={`num bud-${b.spent >= b.limit ? "over" : b.spent >= b.limit * 0.8 ? "near" : "ok"}`}>
                          <Money cents={b.spent} currency={cur} /> de <Money cents={b.limit} currency={cur} />
                        </span>
                      </div>
                      <BudgetBar spent={b.spent} limit={b.limit} />
                    </Link>
                  );
                })}
              </div>
            </section>
                          ),
                        },
                      ]
                    : []),
                  ...(mode === "me" && (pos.payInvoices > 0 || pos.payDebts > 0 || pos.receive > 0)
                    ? [
                        {
                          id: "posicao",
                          label: "A pagar e a receber",
                          size: "card" as const,
                          fit: true,
                          node: (
            <section className="card" aria-labelledby="posicao">
              <div className="card-head">
                <h2 id="posicao">A pagar e a receber</h2>
                <Link href="/cartoes" className="faint">
                  cartões
                </Link>
              </div>
              <div className="rows">
                <div className="row pos-row">
                  <span className="grow">Preciso pagar{pos.nextDue ? ` · fatura vence ${shortDate(pos.nextDue)}` : ""}</span>
                  <span className="num neg">
                    <Money cents={pos.payInvoices + pos.payDebts} currency={cur} />
                  </span>
                </div>
                {pos.payDebts > 0 && <p className="sub">Faturas {formatMoney(pos.payInvoices, cur)} + dívidas com outras pessoas {formatMoney(pos.payDebts, cur)}.</p>}
                <div className="row pos-row">
                  <span className="grow">Dependo de outros em {monthName}</span>
                  <Money cents={pos.receive} currency={cur} />
                </div>
              </div>
            </section>
                          ),
                        },
                      ]
                    : []),
                  ...(mode === "me" && goalRows.length > 0
                    ? [
                        {
                          id: "metas",
                          label: "Metas",
                          size: "card" as const,
                          fit: true,
                          node: (
            <section className="card" aria-labelledby="metas-painel">
              <div className="card-head">
                <h2 id="metas-painel">Metas</h2>
                <Link href="/metas" className="faint">
                  ajustar
                </Link>
              </div>
              <div className="goal-rings">
                {goalRows.map((g) => (
                  <Link key={g.id} href="/metas" className="goal-ring-item" title={g.plan.done ? "Meta batida!" : `Guardar ${formatMoney(g.plan.perMonthCents, cur)}/mês`}>
                    <GoalRing pct={g.plan.pct} done={g.plan.done} late={g.plan.late} size={72} />
                    <span className="grow-name">{g.name}</span>
                    <span className="faint num">
                      {formatMoney(g.savedCents, cur)} de {formatMoney(g.targetCents, cur)}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
                          ),
                        },
                      ]
                    : []),
                  {
                    id: "cats",
                    label: "Gastos por categoria",
                    size: "card" as const,
                    node: (
          <section className="card static-layout" aria-labelledby="cats">
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
                    ),
                  },
                ]),
        ]}
      />
    </>
  );
}
