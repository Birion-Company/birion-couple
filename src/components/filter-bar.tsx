"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { monthLabel } from "@/lib/cards";
import { PERIODS, PERSON_ROLES, filtersToQuery, type Filters } from "@/lib/filters";
import { Select, type SelectOption } from "./select";
import { STATE_FILTER_OPTIONS } from "@/lib/tx-state";

type Option = { id: string; name: string; color: string; archived: boolean; avatarUrl?: string | null };

type Props = {
  filters: Filters;
  participants: Option[];
  categories: Option[];
  projects: Option[];
  cards?: Option[];
  showStatus?: boolean;
  /** No painel o mês fica no navegador de mês, em destaque; aqui some o seletor de período. */
  showPeriod?: boolean;
  /** Pessoa que a página mostra sem escolher ninguém (no painel, você). "Todos" vira a família inteira. */
  defaultPerson?: string | null;
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
  searchable,
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (v: string | null) => void;
  allLabel: string;
  extra?: { value: string; label: string }[];
  /** Pessoas e categorias: sempre com pesquisa (a lista cresce com o tempo). */
  searchable?: boolean;
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
      searchable={searchable}
    />
  );
}

export function FilterBar({ filters, participants, categories, projects, cards = [], showStatus = true, showPeriod = true, defaultPeriod = "tudo", defaultPerson = null }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  // Filtros extras (pessoa, categoria, status…) ficam recolhidos; abrem sozinhos se algum estiver em uso.
  const extras = [filters.person, filters.everyone && defaultPerson, filters.category, filters.project, filters.status, filters.card].filter(Boolean).length;
  // Quem está escolhido de verdade: a pessoa do filtro, ou a padrão da página (a não ser que "Todos" tenha sido escolhido).
  const selected = filters.person ?? (defaultPerson && !filters.everyone ? defaultPerson : null);
  const pickPerson = (id: string | null) => {
    // Clicar de novo na pessoa escolhida desmarca: volta ao padrão da página (no painel, você; na lista, todos).
    if (id && id === selected && id !== defaultPerson) return go({ person: null, everyone: false, role: null });
    go({ person: id && id !== defaultPerson ? id : null, everyone: id === null && !!defaultPerson, role: null });
  };
  const [open, setOpen] = useState(extras > 0);
  // No celular a barra fica presa no topo: com os filtros abertos ela cobriria a lista.
  // Ao rolar para baixo, os filtros se recolhem sozinhos (o botão "Filtros" abre de novo).
  useEffect(() => {
    if (!open) return;
    const start = window.scrollY;
    const onScroll = () => {
      if (window.innerWidth < 900 && window.scrollY - start > 120) setOpen(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  const go = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    start(() => router.replace(pathname + filtersToQuery(next, defaultPeriod), { scroll: false }));
  };

  const active = extras > 0 || !!filters.q || (showPeriod && (filters.period !== defaultPeriod || !!filters.month));
  // Contatos escondidos só aparecem se estiverem escolhidos (ex.: vindo de Dívidas).
  const people = participants.filter((p) => !p.archived || p.id === filters.person);

  return (
    <div className="filter-bar" style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }}>
      <div className={`filters ${open ? "open" : ""}`} role="group" aria-label="Período e filtros">
        {showPeriod && !filters.month && (
        <Select
          variant="chip"
          ariaLabel="Período"
          value={filters.period}
          options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
          onChange={(v) => go({ period: v as Filters["period"], month: null })}
          active={filters.period !== defaultPeriod}
        />
        )}
        {showPeriod && filters.month && (
          <button type="button" className="chip on" onClick={() => go({ month: null, period: defaultPeriod, from: null, to: null })} title="Tirar o mês">
            {monthLabel(filters.month)} <X size={13} strokeWidth={1.8} />
          </button>
        )}
        {showPeriod && filters.period === "custom" && !filters.month && (
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
        <button type="button" className={`chip ${extras ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-tour="filters">
          <SlidersHorizontal size={14} strokeWidth={1.7} /> Filtros{extras ? ` (${extras})` : ""}
        </button>
        {/* Os filtros abrem para o lado, na mesma linha (no celular, rola para o lado). */}
        {open && (
          <span className="filters-inline" role="group" aria-label="Mais filtros">
            {/* Uma linha só, cada filtro num menu recolhido (pessoa e categoria com pesquisa). */}
            {people.length > 1 && (
              <ChipSelect
                label="Pessoa"
                allLabel={defaultPerson ? "Todos (a família)" : "Todas as pessoas"}
                value={selected}
                options={people}
                onChange={(v) => pickPerson(v)}
                searchable
              />
            )}
            {/* Com pessoa escolhida: o que mostrar dela, num menu só. */}
            {selected && (
              <Select
                variant="chip"
                ariaLabel="O que mostrar da pessoa"
                value={filters.role ?? ""}
                options={PERSON_ROLES.map((r) => ({ value: r.value, label: r.label }))}
                onChange={(v) => go({ role: (v || null) as Filters["role"], person: v ? selected : filters.person })}
                active={!!filters.role}
              />
            )}
            <ChipSelect
              searchable
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
              <ChipSelect label="Status" allLabel="Todos os status" value={filters.status} options={STATE_FILTER_OPTIONS.map((o) => ({ ...o, archived: false }))} onChange={(v) => go({ status: v })} />
            )}
            {cards.length > 0 && (
              <ChipSelect label="Cartão" allLabel="Todos os cartões" value={filters.card} options={cards} onChange={(v) => go({ card: v })} />
            )}
          </span>
        )}
        {active && (
          <button
            type="button"
            className="chip"
            onClick={() => go({ ...(showPeriod ? { month: null, period: defaultPeriod, from: null, to: null } : {}), person: null, everyone: false, role: null, category: null, project: null, status: null, card: null, q: null })}
          >
            <X size={14} strokeWidth={1.6} /> Limpar
          </button>
        )}
      </div>
    </div>
  );
}
