import type { Metadata } from "next";
import Link from "next/link";
import { ListPlus, Plus, Search } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { RecurringList } from "@/components/recurring-list";
import { TxList } from "@/components/tx-list";
import { Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { MonthNav } from "@/components/month-nav";
import { addMonthsKey } from "@/lib/cards";
import { defaultPanelMonth } from "@/lib/card-queries";
import { MONTHS_AHEAD, filtersToQuery, parseFilters, thisMonthKey } from "@/lib/filters";
import { getLookupsFor, getRecurringFor, householdStartMonth, listTransactions } from "@/lib/queries";

export const metadata: Metadata = { title: "Lançamentos" };

const PAGE = 100;

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const auth = await requireAuth();
  const sp = await searchParams;
  // Um mês por vez, igual ao painel: abre na fatura em aberto; vai do primeiro mês de uso até 12 à frente.
  const [current, started] = await Promise.all([defaultPanelMonth(auth), householdStartMonth(auth.householdId)]);
  const firstMonth = started < current ? started : current;
  const lastMonth = addMonthsKey(thisMonthKey(), MONTHS_AHEAD);
  const asked = typeof sp.mes === "string" ? sp.mes : null;
  const month = asked && asked >= firstMonth && asked <= lastMonth ? asked : current;
  const filters = parseFilters({ ...sp, mes: month }, "mes");
  const pages = Math.min(50, Math.max(1, Number(sp.paginas) || 1));
  // Em paralelo: as duas listas esperam a mesma manutenção (ensureRecurring, uma vez por requisição),
  // então o "próximo em" das contas fixas já sai atualizado.
  const [lookups, { rows, count, total, futureCount }, recurring] = await Promise.all([
    getLookupsFor(auth),
    listTransactions(auth, filters, PAGE * pages),
    getRecurringFor(auth, filters),
  ]);
  const personName = filters.person ? lookups.participants.find((p) => p.id === filters.person)?.name : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lançamentos</h1>
          <p className="muted">
            {count} {count === 1 ? "lançamento" : "lançamentos"} · <Money cents={total} currency={auth.currency} /> em despesas{personName ? ` (parte de ${personName})` : ""}
          </p>
        </div>
        <div className="actions" data-tour="tx-actions">
          <Link className="btn" href="/transacoes/lote">
            <ListPlus size={16} strokeWidth={1.6} aria-hidden /> <span className="hide-sm">Lançar vários</span>
            <span className="sr-only">Lançar vários</span>
          </Link>
          <Link className="btn primary" href="/transacoes/nova" data-tour="tx-new">
            <Plus size={16} /> <span>Novo</span>
          </Link>
        </div>
      </div>

      <MonthNav
        filters={filters}
        month={month}
        current={current}
        min={firstMonth}
        max={lastMonth}
        hasCards={lookups.cards.some((c) => !c.archived)}
      />

      {/* Busca e filtros ficam presos no topo ao rolar: dá para pesquisar sem voltar lá em cima. */}
      <div className="list-toolbar">
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
        defaultPeriod="mes"
      />
      </div>

      <RecurringList items={recurring} currency={auth.currency} />

      <div data-tour={rows.length > 0 ? "tx-list" : "tx-list-empty"}>
        <TxList rows={rows} lookups={lookups} currency={auth.currency} viewer={{ userId: auth.userId, admin: auth.role === "owner", participantId: auth.participantId }} />
      </div>

      {(futureCount > 0 || filters.future) && filters.period === "tudo" && (
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
