/**
 * Regras de fatura de cartão de crédito. Tudo trabalha com datas "AAAA-MM-DD" e meses "AAAA-MM",
 * sem fuso horário, para dar o mesmo resultado no servidor e no navegador.
 *
 * Convenções (as mesmas da maioria dos bancos brasileiros):
 * - A fatura é identificada pelo mês em que fecha ("2026-12" = fecha em dezembro).
 * - Compras feitas antes do dia de fechamento entram na fatura que fecha naquele mês;
 *   compras no próprio dia do fechamento ou depois já entram na fatura seguinte.
 * - Se o dia de vencimento for maior que o de fechamento, vence no mesmo mês; senão, no mês seguinte.
 * - Em meses curtos, dias 29–31 viram o último dia do mês.
 */

export type CardRules = { closingDay: number; dueDay: number };

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month1: number) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function parseMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { y, m };
}

/** Soma meses a um mês "AAAA-MM". */
export function addMonthsKey(key: string, n: number) {
  const { y, m } = parseMonth(key);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Data do dia `day` no mês, limitada ao último dia do mês. */
export function dayInMonth(key: string, day: number) {
  const { y, m } = parseMonth(key);
  return `${key}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

/** Soma meses a uma data mantendo o dia (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonthsIso(iso: string, n: number) {
  return dayInMonth(addMonthsKey(iso.slice(0, 7), n), Number(iso.slice(8, 10)));
}

/** Soma dias a uma data. */
export function addDaysIso(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Quantos dias de `from` até `to` (negativo se `to` já passou). */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Em qual fatura (mês de fechamento) entra uma compra feita nesta data. */
export function invoiceOf(date: string, closingDay: number) {
  const key = date.slice(0, 7);
  return date < dayInMonth(key, closingDay) ? key : addMonthsKey(key, 1);
}

/** Datas de fechamento e vencimento de uma fatura. */
export function invoiceDates(key: string, rules: CardRules) {
  const closing = dayInMonth(key, rules.closingDay);
  const due = dayInMonth(rules.dueDay > rules.closingDay ? key : addMonthsKey(key, 1), rules.dueDay);
  return { closing, due };
}

/** Período de compras de uma fatura: do fechamento anterior até a véspera do fechamento (inclusivo). */
export function invoiceRange(key: string, closingDay: number) {
  return {
    from: dayInMonth(addMonthsKey(key, -1), closingDay),
    to: addDaysIso(dayInMonth(key, closingDay), -1),
  };
}

/** Sugestão de vencimento: uma semana depois do fechamento, como costuma ser nos bancos. */
export function suggestDueDay(closingDay: number) {
  const d = closingDay + 7;
  return d > 31 ? d - 31 : d;
}

/**
 * Situação do cartão hoje: a fatura aberta (onde entram as compras de hoje) e a próxima fatura
 * a vencer (a última que fechou, enquanto não passou do vencimento; depois disso, a aberta).
 */
export function cardSchedule(rules: CardRules, today: string) {
  const open = invoiceOf(today, rules.closingDay);
  const openDates = invoiceDates(open, rules);
  const closed = addMonthsKey(open, -1);
  const closedDates = invoiceDates(closed, rules);
  const dueInvoice = closedDates.due >= today ? closed : open;
  const due = dueInvoice === closed ? closedDates.due : openDates.due;
  return {
    open,
    closingDate: openDates.closing,
    daysToClosing: daysBetween(today, openDates.closing),
    dueInvoice,
    dueDate: due,
    daysToDue: daysBetween(today, due),
  };
}

export type CardAlert = {
  /** Identifica o evento (cartão + tipo + data) para lembrar quem já dispensou o aviso. */
  key: string;
  cardId: string;
  cardName: string;
  color: string;
  type: "closing" | "due";
  date: string;
  daysLeft: number;
  amountCents: number;
  /** Parte de quem está vendo nesta fatura (o resto é de outras pessoas, que devem para quem paga). */
  mineCents?: number;
};

/** Avisos dos próximos fechamentos e vencimentos dentro da antecedência escolhida no cartão. */
export function cardAlerts(
  card: CardRules & { id: string; name: string; color: string; alertDays: number | null },
  today: string,
  totalOf: (invoice: string) => number,
  mineOf?: (invoice: string) => number,
): CardAlert[] {
  if (card.alertDays === null || card.alertDays < 0) return [];
  const s = cardSchedule(card, today);
  const out: CardAlert[] = [];
  // Fatura sem nada não precisa de aviso.
  if (s.daysToClosing <= card.alertDays) {
    const amount = totalOf(s.open);
    if (amount > 0) {
      out.push({ key: `${card.id}:closing:${s.closingDate}`, cardId: card.id, cardName: card.name, color: card.color, type: "closing", date: s.closingDate, daysLeft: s.daysToClosing, amountCents: amount, mineCents: mineOf?.(s.open) });
    }
  }
  if (s.daysToDue <= card.alertDays) {
    const amount = totalOf(s.dueInvoice);
    if (amount > 0) {
      out.push({ key: `${card.id}:due:${s.dueDate}`, cardId: card.id, cardName: card.name, color: card.color, type: "due", date: s.dueDate, daysLeft: s.daysToDue, amountCents: amount, mineCents: mineOf?.(s.dueInvoice) });
    }
  }
  return out;
}

/** Hoje no fuso da família (por enquanto, horário de Brasília). */
export function todayIn(timeZone = "America/Sao_Paulo", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "dez/2026" */
export function monthLabel(key: string) {
  const { y, m } = parseMonth(key);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").replace(" de ", "/");
}

/** "15/12" */
export function shortDate(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// ---------- Compras parceladas e recorrentes ----------

export type SeriesKind = "installment" | "monthly";
export type SplitPart = { participantId: string; amountCents: number };

/**
 * Gera as parcelas de uma compra.
 * - installment: o valor total é dividido em `count` parcelas; a parte de cada pessoa também,
 *   e os centavos que sobram vão para as primeiras parcelas.
 * - monthly: o mesmo valor e a mesma divisão se repetem todo mês.
 * A parcela n cai na data da compra + (n-1) meses.
 */
export function buildSeries(date: string, kind: SeriesKind, count: number, amountCents: number, splits: SplitPart[]) {
  const perPerson =
    kind === "installment"
      ? splits.map((s) => ({ participantId: s.participantId, parts: splitCents(s.amountCents, count) }))
      : splits.map((s) => ({ participantId: s.participantId, parts: Array.from({ length: count }, () => s.amountCents) }));
  return Array.from({ length: count }, (_, i) => {
    const parts = perPerson.map((p) => ({ participantId: p.participantId, amountCents: p.parts[i] })).filter((p) => p.amountCents > 0);
    return {
      index: i + 1,
      date: addMonthsIso(date, i),
      amountCents: kind === "installment" ? parts.reduce((a, p) => a + p.amountCents, 0) : amountCents,
      splits: parts,
    };
  });
}

function splitCents(total: number, count: number) {
  const base = Math.floor(total / count);
  let rest = total - base * count;
  return Array.from({ length: count }, () => {
    if (rest > 0) {
      rest -= 1;
      return base + 1;
    }
    return base;
  });
}

/** "3/10" para parcelas; "3/12" também para recorrentes (o rótulo diz qual é). */
export function seriesLabel(kind: string | null, index: number | null, total: number | null) {
  if (!kind || !index) return null;
  if (!total) return kind === "monthly" ? "Todo mês" : null;
  return kind === "installment" ? `Parcela ${index}/${total}` : `Mês ${index}/${total}`;
}
