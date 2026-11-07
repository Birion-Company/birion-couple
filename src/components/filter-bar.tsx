"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, X } from "lucide-react";
import { PERIODS, filtersToQuery, type Filters } from "@/lib/filters";
import { Avatar } from "./ui";

type Option = { id: string; name: string; color: string; archived: boolean };

type Props = {
  filters: Filters;
  participants: Option[];
  categories: Option[];
  projects: Option[];
  statuses: Option[];
  showStatus?: boolean;
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
  const current = options.find((o) => o.id === value)?.name ?? extra?.find((e) => e.value === value)?.label;
  return (
    <label className={`chip ${value ? "on" : ""}`}>
      <span>{current ?? label}</span>
      <ChevronDown size={14} strokeWidth={1.6} />
      <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{allLabel}</option>
        {extra?.map((e) => (
          <option key={e.value} value={e.value}>
            {e.label}
          </option>
        ))}
        {options
          .filter((o) => !o.archived || o.id === value)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
      </select>
    </label>
  );
}

export function FilterBar({ filters, participants, categories, projects, statuses, showStatus = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const go = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    start(() => router.replace(pathname + filtersToQuery(next), { scroll: false }));
  };

  const active =
    filters.person || filters.category || filters.project || filters.status || filters.q || filters.period !== "tudo";
  const people = participants.filter((p) => !p.archived || p.id === filters.person);

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>
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
      <div className="filters" role="group" aria-label="Filtros">
        <label className={`chip ${filters.period !== "tudo" ? "on" : ""}`}>
          <span>{PERIODS.find((p) => p.value === filters.period)?.label}</span>
          <ChevronDown size={14} strokeWidth={1.6} />
          <select
            aria-label="Período"
            value={filters.period}
            onChange={(e) => go({ period: e.target.value as Filters["period"] })}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
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
        {active && (
          <button
            type="button"
            className="chip"
            onClick={() => go({ person: null, category: null, project: null, status: null, q: null, period: "tudo", from: null, to: null })}
          >
            <X size={14} strokeWidth={1.6} /> Limpar
          </button>
        )}
      </div>
    </div>
  );
}
