"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { PERIODS, filtersToQuery, type Filters } from "@/lib/filters";
import { Select, type SelectOption } from "./select";
import { Avatar } from "./ui";

type Option = { id: string; name: string; color: string; archived: boolean };

type Props = {
  filters: Filters;
  participants: Option[];
  categories: Option[];
  projects: Option[];
  statuses: Option[];
  cards?: Option[];
  showStatus?: boolean;
  /** Período que a página usa sem parâmetro na URL. */
  defaultPeriod?: Filters["period"];
};

function ChipSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
  extra,
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (v: string | null) => void;
  allLabel: string;
  extra?: { value: string; label: string }[];
}) {
  const list: SelectOption[] = [
    { value: "", label: allLabel },
    ...(extra ?? []),
    ...options.filter((o) => !o.archived || o.id === value).map((o) => ({ value: o.id, label: o.name, color: o.color })),
  ];
  return (
    <Select
      variant="chip"
      ariaLabel={label}
      value={value ?? ""}
      options={list}
      onChange={(v) => onChange(v || null)}
      active={!!value}
      buttonLabel={value ? undefined : label}
    />
  );
}

export function FilterBar({ filters, participants, categories, projects, statuses, cards = [], showStatus = true, defaultPeriod = "tudo" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  // Filtros extras (pessoa, categoria, status…) ficam recolhidos; abrem sozinhos se algum estiver em uso.
  const extras = [filters.person, filters.category, filters.project, filters.status, filters.card].filter(Boolean).length;
  const [open, setOpen] = useState(extras > 0);

  const go = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    start(() => router.replace(pathname + filtersToQuery(next, defaultPeriod), { scroll: false }));
  };

  const active = extras > 0 || !!filters.q || filters.period !== defaultPeriod;
  const people = participants.filter((p) => !p.archived || p.id === filters.person);

  return (
    <div className="filter-bar" style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>
      <div className="filters" role="group" aria-label="Período e filtros">
        <Select
          variant="chip"
          ariaLabel="Período"
          value={filters.period}
          options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
          onChange={(v) => go({ period: v as Filters["period"] })}
          active={filters.period !== defaultPeriod}
        />
        {filters.period === "custom" && (
          <>
            <span className="chip on">
              <span className="sr-only">De</span>
              <input type="date" value={filters.from ?? ""} onChange={(e) => go({ from: e.target.value || null })} aria-label="De" />
            </span>
            <span className="chip on">
              <span className="sr-only">Até</span>
              <input type="date" value={filters.to ?? ""} onChange={(e) => go({ to: e.target.value || null })} aria-label="Até" />
            </span>
          </>
        )}
        <button type="button" className={`chip ${extras ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal size={14} strokeWidth={1.7} /> Filtros{extras ? ` (${extras})` : ""}
        </button>
        {active && (
          <button
            type="button"
            className="chip"
            onClick={() => go({ person: null, category: null, project: null, status: null, card: null, q: null, period: defaultPeriod, from: null, to: null })}
          >
            <X size={14} strokeWidth={1.6} /> Limpar
          </button>
        )}
      </div>
      {open && (
        <div className="filters-more">
          {people.length > 1 && (
            <div className="person-pills" role="group" aria-label="Filtrar por pessoa">
              <button type="button" className={`chip ${!filters.person ? "on" : ""}`} onClick={() => go({ person: null })}>
                Todos
              </button>
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip ${filters.person === p.id ? "on" : ""}`}
                  onClick={() => go({ person: filters.person === p.id ? null : p.id })}
                  aria-pressed={filters.person === p.id}
                >
                  <Avatar name={p.name} color={p.color} size={22} />
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div className="filters" role="group" aria-label="Mais filtros">
            <ChipSelect
              label="Categoria"
              allLabel="Todas as categorias"
              value={filters.category}
              options={categories}
              extra={[{ value: "sem", label: "Sem categoria" }]}
              onChange={(v) => go({ category: v })}
            />
            {projects.length > 0 && (
              <ChipSelect label="Projeto" allLabel="Todos os projetos" value={filters.project} options={projects} onChange={(v) => go({ project: v })} />
            )}
            {showStatus && (
              <ChipSelect label="Status" allLabel="Todos os status" value={filters.status} options={statuses} onChange={(v) => go({ status: v })} />
            )}
            {cards.length > 0 && (
              <ChipSelect label="Cartão" allLabel="Todos os cartões" value={filters.card} options={cards} onChange={(v) => go({ card: v })} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
