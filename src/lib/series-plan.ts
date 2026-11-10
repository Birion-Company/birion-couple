import { addMonthsIso } from "./cards";

/**
 * Mudar uma compra parcelada depois de criada: número de parcelas, data da 1ª e valor de cada uma.
 * O que veio do extrato (importado) é real: mantém data e valor. O resto (previstas e lançadas à mão)
 * se ajusta: cada parcela k cai em "data da 1ª + (k − 1) meses".
 */
export type SeriesItem = { id: string; index: number; date: string; amountCents: number; source: string };

export type PlanStep =
  | { action: "keep"; id: string; index: number; date: string; amountCents: number; real: boolean }
  | { action: "update"; id: string; index: number; date: string; amountCents: number }
  | { action: "create"; index: number; date: string; amountCents: number };

export type SeriesPlan = {
  steps: PlanStep[];
  /** Parcelas que somem (as do fim, quando o número diminui). */
  remove: { id: string; index: number; date: string }[];
  error: string | null;
};

export const isReal = (source: string) => source === "ofx" || source === "csv";

/** Data da 1ª parcela, mesmo que ela não exista (ex.: a importação começou na 3/4). */
export function firstDateOf(items: SeriesItem[]): string | null {
  const ref = [...items].sort((a, b) => a.index - b.index)[0];
  return ref ? addMonthsIso(ref.date, -(ref.index - 1)) : null;
}

export function planSeries(items: SeriesItem[], next: { total: number; firstDate: string; amountCents: number | null }): SeriesPlan {
  const byIndex = new Map(items.map((x) => [x.index, x]));
  const lastReal = Math.max(0, ...items.filter((x) => isReal(x.source)).map((x) => x.index));
  if (!Number.isInteger(next.total) || next.total < 2) return { steps: [], remove: [], error: "Uma compra parcelada tem pelo menos 2 parcelas." };
  if (next.total > 48) return { steps: [], remove: [], error: "No máximo 48 parcelas." };
  if (next.total < lastReal) return { steps: [], remove: [], error: `A parcela ${lastReal} já veio no extrato: o mínimo é ${lastReal} parcelas.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.firstDate)) return { steps: [], remove: [], error: "Escolha a data da 1ª parcela." };
  if (next.amountCents !== null && next.amountCents <= 0) return { steps: [], remove: [], error: "O valor da parcela precisa ser maior que zero." };
  // Valor das parcelas novas: o escolhido, ou o da última parcela que existe.
  const sorted = [...items].sort((a, b) => a.index - b.index);
  const fallback = sorted[sorted.length - 1]?.amountCents ?? 0;
  const steps: PlanStep[] = [];
  for (let k = 1; k <= next.total; k++) {
    const date = addMonthsIso(next.firstDate, k - 1);
    const cur = byIndex.get(k);
    if (!cur) {
      // Parcelas antes da primeira que existe (a importação começou no meio) não são criadas.
      if (sorted.length && k < sorted[0].index) continue;
      steps.push({ action: "create", index: k, date, amountCents: next.amountCents ?? fallback });
    } else if (isReal(cur.source)) {
      steps.push({ action: "keep", id: cur.id, index: k, date: cur.date, amountCents: cur.amountCents, real: true });
    } else {
      const amountCents = next.amountCents ?? cur.amountCents;
      if (cur.date === date && cur.amountCents === amountCents) steps.push({ action: "keep", id: cur.id, index: k, date, amountCents, real: false });
      else steps.push({ action: "update", id: cur.id, index: k, date, amountCents });
    }
  }
  const remove = sorted.filter((x) => x.index > next.total).map((x) => ({ id: x.id, index: x.index, date: x.date }));
  return { steps, remove, error: null };
}

/** Divide o novo valor na mesma proporção da divisão de antes (o arredondamento vai para a última parte). */
export function scaleSplits<S extends { participantId: string; amountCents: number }>(splits: S[], amountCents: number) {
  const total = splits.reduce((a, s) => a + s.amountCents, 0);
  if (splits.length === 0) return [];
  let used = 0;
  return splits.map((s, i) => {
    const part = i === splits.length - 1 ? amountCents - used : total > 0 ? Math.round((s.amountCents * amountCents) / total) : Math.floor(amountCents / splits.length);
    used += part;
    return { participantId: s.participantId, amountCents: part };
  });
}
