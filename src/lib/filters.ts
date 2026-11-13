import { todayIn } from "./cards";
import { stateFromParam } from "./tx-state";
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
  /** "Todos" escolhido de propósito (?pessoa=todos): no painel, que abre na sua parte, mostra a família inteira. */
  everyone: boolean;
  /**
   * Com pessoa escolhida, o que conta: tudo que a envolve (padrão), só o que é dela (tem parte na conta)
   * ou o que ela pagou para outras pessoas (os outros devem a ela).
   */
  role: PersonRole | null;
  category: string | null;
  project: string | null;
  status: string | null;
  card: string | null;
  q: string | null;
  /** Aba Dívidas: só o que alguém ainda deve (no cartão ou fora), de todos os meses. */
  debtsOnly?: boolean;
  /** Mês escolhido no painel ("2026-12"); as datas de/até são o mês inteiro. */
  month: string | null;
  /**
   * Filtrar por mês da compra ("2026-10"): sem cartão, pela data; no cartão, pelo mês da fatura
   * (cartão que fecha dia 3 → compras de 03/10 a 02/11 são de outubro). Ignora de/até.
   */
  competence?: string | null;
  /** Em "Todo o período": incluir lançamentos depois do mês atual (parcelas e meses futuros). */
  future: boolean;
  /** "Dos dois" (?juntos=1): só o que o casal divide e os pagamentos entre as duas pessoas. */
  together?: boolean;
  /** Preenchido no servidor: a outra pessoa do casal (para o filtro "Dos dois"). */
  partnerId?: string | null;
};

export type PersonRole = "dele" | "a-receber";

export const PERSON_ROLES: { value: PersonRole | ""; label: string; hint: string }[] = [
  { value: "", label: "Tudo que envolve", hint: "pagou ou tem parte" },
  { value: "dele", label: "Só o que é dele(a)", hint: "tem parte na conta" },
  { value: "a-receber", label: "A receber", hint: "o que as outras pessoas têm que dar a ele(a): ele(a) pagou e a conta é (também) delas" },
];

/** Até quantos meses à frente dá para ver (parcelas e o que se repete todo mês). */
export const MONTHS_AHEAD = 12;

export const thisMonthKey = () => todayIn().slice(0, 7);

/** Mês válido ("AAAA-MM"); senão, nulo. */
export function clampMonth(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
  // O limite (até o último mês com algo lançado) é conferido em cada página (navigableMonths).
  return v;
}

/** Primeiro e último dia de um mês "AAAA-MM". */
export function monthRange(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { from: `${key}-01`, to: `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

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
  const month = clampMonth(one(sp.mes));
  if (month) {
    ({ from, to } = monthRange(month));
  } else if (period === "custom") {
    from = isDate(one(sp.de));
    to = isDate(one(sp.ate));
  } else {
    ({ from, to } = periodRange(period));
  }
  return {
    period: month ? "custom" : period,
    month,
    competence: month,
    from,
    to,
    person: isId(one(sp.pessoa)),
    everyone: one(sp.pessoa) === "todos",
    role: isId(one(sp.pessoa)) && PERSON_ROLES.some((r) => r.value && r.value === one(sp.como)) ? (one(sp.como) as PersonRole) : null,
    category: one(sp.categoria) === "sem" ? "sem" : isId(one(sp.categoria)),
    project: isId(one(sp.projeto)),
    status: stateFromParam(one(sp.status)) ? one(sp.status)! : null,
    card: isId(one(sp.cartao)),
    future: one(sp.futuros) === "1",
    debtsOnly: one(sp.dividas) === "1",
    together: one(sp.juntos) === "1",
    q: one(sp.q)?.slice(0, 100) ?? null,
  };
}

/**
 * Monta a query string de volta (usada nos links e no formulário de filtros).
 * `defaultPeriod` é o período que a página usa sem parâmetro (o painel abre em "Este mês").
 */
export function filtersToQuery(f: Partial<Filters>, defaultPeriod: PeriodKey = "tudo"): string {
  const p = new URLSearchParams();
  if (f.month) p.set("mes", f.month);
  else if (f.period && f.period !== defaultPeriod) p.set("periodo", f.period);
  if (f.period === "custom" && !f.month) {
    if (f.from) p.set("de", f.from);
    if (f.to) p.set("ate", f.to);
  }
  if (f.person) p.set("pessoa", f.person);
  else if (f.everyone) p.set("pessoa", "todos");
  if (f.person && f.role) p.set("como", f.role);
  if (f.category) p.set("categoria", f.category);
  if (f.project) p.set("projeto", f.project);
  if (f.status) p.set("status", f.status);
  if (f.card) p.set("cartao", f.card);
  if (f.q) p.set("q", f.q);
  if (f.future) p.set("futuros", "1");
  if (f.together) p.set("juntos", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}
