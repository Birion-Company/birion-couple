import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, Upload } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { RecurringList } from "@/components/recurring-list";
import { TxList } from "@/components/tx-list";
import { Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { getLookupsFor, getRecurring, listTransactions } from "@/lib/queries";

export const metadata: Metadata = { title: "Lançamentos" };

const PAGE = 100;

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const pages = Math.min(50, Math.max(1, Number(sp.paginas) || 1));
  const lookups = await getLookupsFor(auth);
  const { rows, count, total, futureCount } = await listTransactions(auth, filters, PAGE * pages);
  // Depois da lista: ela é que cria os meses que faltam, e o "próximo em" já sai atualizado.
  const recurring = await getRecurring(auth);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lançamentos</h1>
          <p className="muted">
            {count} {count === 1 ? "lançamento" : "lançamentos"} · <Money cents={total} currency={auth.currency} /> em despesas
          </p>
        </div>
        <div className="actions">
          <Link className="btn" href="/importar">
            <Upload size={16} strokeWidth={1.6} aria-hidden /> <span className="hide-sm">Importar</span>
            <span className="sr-only">Importar extrato</span>
          </Link>
          <Link className="btn primary" href="/transacoes/nova">
            <Plus size={16} /> <span>Novo</span>
          </Link>
        </div>
      </div>

      <form action="/transacoes" style={{ marginBottom: 12, position: "relative" }}>
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
        statuses={lookups.statuses}
        cards={lookups.cards}
      />

      <RecurringList items={recurring} currency={auth.currency} />

      <TxList rows={rows} lookups={lookups} currency={auth.currency} viewer={{ userId: auth.userId, admin: auth.role === "owner" }} />

      {(futureCount > 0 || filters.future) && filters.period === "tudo" && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Link className="btn ghost small future-toggle" href={`/transacoes${filtersToQuery({ ...filters, future: !filters.future })}`} scroll={false}>
            {filters.future
              ? "Esconder lançamentos futuros"
              : `Mostrar ${futureCount} ${futureCount === 1 ? "lançamento futuro" : "lançamentos futuros"} (parcelas que ainda vão chegar)`}
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
