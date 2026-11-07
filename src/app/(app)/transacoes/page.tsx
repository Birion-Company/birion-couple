import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { TxList } from "@/components/tx-list";
import { Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { getLookups, listTransactions } from "@/lib/queries";

export const metadata: Metadata = { title: "Lançamentos" };

const PAGE = 100;

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const pages = Math.min(50, Math.max(1, Number(sp.paginas) || 1));
  const lookups = await getLookups(auth.householdId);
  const { rows, count, total } = await listTransactions(auth.householdId, filters, PAGE * pages);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lançamentos</h1>
          <p className="muted">
            {count} {count === 1 ? "lançamento" : "lançamentos"} · <Money cents={total} currency={auth.currency} /> em despesas
          </p>
        </div>
        <Link className="btn primary" href="/transacoes/nova">
          <Plus size={16} /> <span>Novo</span>
        </Link>
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

      <TxList rows={rows} lookups={lookups} currency={auth.currency} />

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
