/**
 * Padrões nas descrições dos extratos:
 * - parcelas ("Mercadolivre*Mercadol - Parcela 1/10", "LOJA X PARC 03/10");
 * - o "estabelecimento" de cada lançamento, para reconhecer compras repetidas
 *   ("Dl *Uberrides" de outubro e de novembro são o mesmo lugar).
 */

const INSTALLMENT = /^(.*?)[\s\-–:]*\b(?:parcela|parc\.?)\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i;

export type Installment = { base: string; index: number; total: number };

/** "Loja - Parcela 3/10" → { base: "Loja", index: 3, total: 10 }. Nulo se não for parcela. */
export function parseInstallment(description: string): Installment | null {
  const m = INSTALLMENT.exec(description.trim());
  if (!m) return null;
  const index = Number(m[2]);
  const total = Number(m[3]);
  if (total < 2 || total > 48 || index < 1 || index > total) return null;
  return { base: m[1].trim(), index, total };
}

/**
 * Chave do estabelecimento: sem acentos, maiúsculas, parcela, "- NuPay", símbolos e números soltos.
 * "Dl *Uberrides" → "dl uberrides"; "Viacao Cidade Sol - Parcela 1/2" → "viacao cidade sol".
 */
export function merchantKey(description: string): string {
  const base = parseInstallment(description)?.base ?? description;
  return base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*-\s*nupay\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compras recorrentes: estabelecimentos que aparecem em pelo menos `minMonths` meses diferentes.
 * Parcelas não contam (já são uma série).
 */
export function recurringMerchants(rows: { description: string; date: string }[], minMonths = 2): Set<string> {
  const months = new Map<string, Set<string>>();
  for (const r of rows) {
    if (parseInstallment(r.description)) continue;
    const key = merchantKey(r.description);
    if (!key) continue;
    const set = months.get(key) ?? new Set<string>();
    set.add(r.date.slice(0, 7));
    months.set(key, set);
  }
  return new Set([...months].filter(([, m]) => m.size >= minMonths).map(([k]) => k));
}
