import { addMonthsIso, daysInMonth } from "./cards";

/** Último dia do mês de uma data ("2026-11-07" → "2026-11-30"). */
export function endOfMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return `${iso.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

/**
 * Lançamentos de uma recorrência sem fim que já deveriam existir:
 * do número `nextIndex` em diante, todos com data até `horizon` (inclusive).
 * O n-ésimo cai na data inicial + (n-1) meses, no mesmo dia (ou no último dia em meses curtos).
 */
export function dueOccurrences(startDate: string, nextIndex: number, horizon: string, max = 120) {
  const out: { index: number; date: string }[] = [];
  for (let i = nextIndex; out.length < max; i++) {
    const date = addMonthsIso(startDate, i - 1);
    if (date > horizon) break;
    out.push({ index: i, date });
  }
  return out;
}
