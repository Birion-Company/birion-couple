import type { Metadata } from "next";
import Link from "next/link";
import { ListPlus, Search } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { RecurringList } from "@/components/recurring-list";
import { TxList } from "@/components/tx-list";
import { Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { MonthNav } from "@/components/month-nav";

import { defaultPanelMonth } from "@/lib/card-queries";
import { longMonth } from "@/lib/cards";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { getDebtLedger, getLookupsFor, getRecurringFor, listTransactions, navigableMonths } from "@/lib/queries";
import { DebtsPanel } from "@/components/debts-panel";

export const metadata: Metadata = { title: "Lançamentos" };

const PAGE = 100;

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const auth = await requireAuth();
  const sp = await searchParams;
  // Um mês por vez, igual ao painel: abre na fatura em aberto; vai do primeiro mês de uso ao último com algo lançado.
  const current = await defaultPanelMonth(auth);
  const { first: firstMonth, last: lastMonth } = await navigableMonths(auth.householdId, current);
  const asked = typeof sp.mes === "string" ? sp.mes : null;
  const month = asked && asked >= firstMonth && asked <= lastMonth ? asked : current;
  // Aba "Dívidas": só o que alguém ainda deve, de todos os meses (sem o seletor de mês).
  const debtsTab = sp.dividas === "1";
  const parsed = debtsTab ? parseFilters({ ...sp, mes: undefined }, "tudo") : parseFilters({ ...sp, mes: month }, "mes");
  // Pessoa escolhida sem dizer o quê: mostra os gastos dela ("Gastos da Clara").
  const filters = parsed.person && !parsed.role && !debtsTab ? { ...parsed, role: "dele" as const } : parsed;
  const pages = Math.min(50, Math.max(1, Number(sp.paginas) || 1));
  // Em paralelo: as duas listas esperam a mesma manutenção (ensureRecurring, uma vez por requisição),
  // então o "próximo em" das contas fixas já sai atualizado.
  const lookups = await getLookupsFor(auth);
  const [{ rows, count, total, futureCount }, recurring, ledger] = await Promise.all([
    listTransactions(auth, filters, PAGE * pages),
    getRecurringFor(auth, filters),
    // Dívidas (antes uma página): "Quem deve para quem" e o saldo com a pessoa escolhida.
    debtsTab || filters.person ? getDebtLedger(auth, lookups) : Promise.resolve(null),
  ]);
  const personName = filters.person ? lookups.participants.find((p) => p.id === filters.person)?.name : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lançamentos</h1>
          <p className="muted">
            {debtsTab ? (
              <>
                {count} {count === 1 ? "lançamento" : "lançamentos"} com dívida em aberto{personName ? ` · com ${personName}` : ""}
              </>
            ) : (
              <>
                {count} {count === 1 ? "lançamento" : "lançamentos"} · <Money cents={total} currency={auth.currency} /> em despesas{personName ? ` (parte de ${personName})` : ""}
              </>
            )}
          </p>
        </div>
        <div className="actions" data-tour="tx-actions">
          {/* Novo lançamento: o botão do canto da tela (no celular, o + redondo). */}
          <Link className="btn" href="/transacoes/lote">
            <ListPlus size={16} strokeWidth={1.6} aria-hidden /> <span className="hide-sm">Lançar vários</span>
            <span className="sr-only">Lançar vários</span>
          </Link>
        </div>
      </div>

      {/* Duas visões: o mês (com o seletor na barra de cima) e as dívidas em aberto de todos os meses. */}
      <nav className="tx-tabs" aria-label="O que mostrar" data-tour="debts-tab">
        <Link href={`/transacoes${month !== current ? `?mes=${month}` : ""}`} className={debtsTab ? "" : "on"} aria-current={debtsTab ? undefined : "page"}>
          {lookups.cards.some((c) => !c.archived) ? `Fatura de ${longMonth(month).replace(/ de \d{4}$/, "").toLowerCase()}` : longMonth(month).replace(/ de \d{4}$/, "")}
        </Link>
        <Link href="/transacoes?dividas=1" className={debtsTab ? "on" : ""} aria-current={debtsTab ? "page" : undefined}>
          Dívidas
        </Link>
      </nav>

      {ledger && <DebtsPanel ledger={ledger} lookups={lookups} me={auth.participantId} person={filters.person} currency={auth.currency} />}

      {!debtsTab && <MonthNav
        filters={filters}
        month={month}
        current={current}
        min={firstMonth}
        max={lastMonth}
        hasCards={lookups.cards.some((c) => !c.archived)}
      />}

      {/* Busca e filtros ficam presos no topo ao rolar: dá para pesquisar sem voltar lá em cima. */}
      <div className="list-toolbar" data-tour="tx-search">
      <form action="/transacoes" style={{ marginBottom: 10, position: "relative" }}>
        {Object.entries(sp)
          .filter(([k]) => !["q", "paginas"].includes(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={String(v)} />
          ))}
        <Search size={16} strokeWidth={1.6} style={{ position: "absolute", left: 12, top: 14, color: "var(--text-3)" }} />
        <input className="input" name="q" defaultValue={filters.q ?? ""} placeholder="Buscar pela descrição" style={{ paddingLeft: 36 }} aria-label="Buscar" />
      </form>

      <FilterBar
        filters={filters}
        participants={lookups.participants}
        categories={lookups.categories}
        projects={lookups.projects}
        cards={lookups.cards}
        showPeriod={false}
        defaultPeriod={debtsTab ? "tudo" : "mes"}
        keep={debtsTab ? "dividas=1" : undefined}
        hideRole={debtsTab}
        showStatus={!debtsTab}
      />
      </div>

      <RecurringList items={recurring} currency={auth.currency} />

      <div data-tour={rows.length > 0 ? "tx-list" : "tx-list-empty"}>
        <TxList rows={rows} lookups={lookups} currency={auth.currency} viewer={{ userId: auth.userId, admin: auth.role === "owner", participantId: auth.participantId }} />
      </div>

      {!debtsTab && (futureCount > 0 || filters.future) && filters.period === "tudo" && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Link className="btn ghost small future-toggle" href={`/transacoes${filtersToQuery({ ...filters, future: !filters.future })}`} scroll={false}>
            {filters.future
              ? "Esconder lançamentos futuros"
              : `Mostrar ${futureCount} ${futureCount === 1 ? "lançamento futuro" : "lançamentos futuros"}`}
          </Link>
        </div>
      )}

      {rows.length < count && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link className="btn" href={`/transacoes${filtersToQuery(filters)}${filtersToQuery(filters) ? "&" : "?"}paginas=${pages + 1}`} scroll={false}>
            Mostrar mais
          </Link>
        </div>
      )}
    </>
  );
}
