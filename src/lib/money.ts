/** Formata centavos como moeda. */
export function formatMoney(cents: number, currency = "BRL", locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/**
 * Lê um valor digitado ou vindo de arquivo e devolve centavos.
 * Aceita "1.234,56", "1234.56", "-12,30", "R$ 45,00", "(12.50)".
 * `decimal` força o separador decimal; sem ele, o último separador com 1–2 dígitos depois é o decimal.
 */
export function parseAmountToCents(input: string | number, decimal?: "," | "."): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d,.\-+]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!s) return null;

  let dec = decimal;
  if (!dec) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    const last = Math.max(lastComma, lastDot);
    if (last === -1) dec = ".";
    else {
      const digitsAfter = s.length - last - 1;
      const sep = s[last] as "," | ".";
      const other = sep === "," ? "." : ",";
      if (s.includes(other) || digitsAfter <= 2) dec = sep;
      else dec = other; // "1.234" = mil e duzentos e trinta e quatro
    }
  }
  const thousands = dec === "," ? "." : ",";
  s = s.split(thousands).join("");
  if (dec === ",") s = s.replace(",", ".");
  if (!/^\d*\.?\d*$/.test(s) || s === "." ) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Divide um valor em partes iguais; os centavos que sobram vão para os primeiros. */
export function splitEqually(totalCents: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalCents / count);
  let rest = totalCents - base * count;
  return Array.from({ length: count }, () => {
    if (rest > 0) {
      rest -= 1;
      return base + 1;
    }
    return base;
  });
}

/** Valor em centavos para o campo de edição ("1234,56"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
