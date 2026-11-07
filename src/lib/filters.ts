/** Filtros compartilhados pelo painel e pela lista de transações. Vivem na URL. */

export type PeriodKey = "tudo" | "mes" | "mes-passado" | "3m" | "ano" | "custom";

export const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "tudo", label: "Todo o período" },
  { value: "mes", label: "Este mês" },
  { value: "mes-passado", label: "Mês passado" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "ano", label: "Este ano" },
  { value: "custom", label: "Escolher datas" },
];

export type Filters = {
  period: PeriodKey;
  from: string | null;
  to: string | null;
  person: string | null;
  category: string | null;
  project: string | null;
  status: string | null;
  card: string | null;
  q: string | null;
};

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;
const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const isId = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Converte um período em datas de início e fim (inclusivas). */
export function periodRange(period: PeriodKey, today = new Date()): { from: string | null; to: string | null } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (period) {
    case "mes":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "mes-passado":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "3m":
      return { from: iso(new Date(y, m - 2, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "ano":
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    default:
      return { from: null, to: null };
  }
}

export function parseFilters(sp: Search, defaultPeriod: PeriodKey = "tudo"): Filters {
  const raw = one(sp.periodo) as PeriodKey | null;
  const period: PeriodKey = PERIODS.some((p) => p.value === raw) ? (raw as PeriodKey) : defaultPeriod;
  let from: string | null;
  let to: string | null;
  if (period === "custom") {
    from = isDate(one(sp.de));
    to = isDate(one(sp.ate));
  } else {
    ({ from, to } = periodRange(period));
  }
  return {
    period,
    from,
    to,
    person: isId(one(sp.pessoa)),
    category: one(sp.categoria) === "sem" ? "sem" : isId(one(sp.categoria)),
    project: isId(one(sp.projeto)),
    status: isId(one(sp.status)),
    card: isId(one(sp.cartao)),
    q: one(sp.q)?.slice(0, 100) ?? null,
  };
}

/** Monta a query string de volta (usada nos links e no formulário de filtros). */
export function filtersToQuery(f: Partial<Filters>): string {
  const p = new URLSearchParams();
  if (f.period && f.period !== "tudo") p.set("periodo", f.period);
  if (f.period === "custom") {
    if (f.from) p.set("de", f.from);
    if (f.to) p.set("ate", f.to);
  }
  if (f.person) p.set("pessoa", f.person);
  if (f.category) p.set("categoria", f.category);
  if (f.project) p.set("projeto", f.project);
  if (f.status) p.set("status", f.status);
  if (f.card) p.set("cartao", f.card);
  if (f.q) p.set("q", f.q);
  const s = p.toString();
  return s ? `?${s}` : "";
}
