import { createHash } from "node:crypto";
import type { ParsedRow } from "./types";

/**
 * Identificador estável para não importar a mesma transação duas vezes.
 * OFX: usa o FITID do banco. CSV: usa data, valor e descrição, mais a ordem em que a
 * combinação aparece no arquivo (duas compras iguais no mesmo dia continuam sendo duas).
 */
export function externalIds(rows: ParsedRow[], format: "ofx" | "csv"): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (format === "ofx" && r.bankId) return `ofx:${r.bankId}`;
    const key = `${r.date}|${r.amountCents}|${r.description.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `${format}:${createHash("sha256").update(`${key}|${n}`).digest("hex").slice(0, 32)}`;
  });
}

/** Aplica as regras "descrição contém texto → categoria". A primeira regra que bate vence. */
export function matchCategory(
  description: string,
  rules: { pattern: string; categoryId: string }[],
): string | null {
  const d = description.toLowerCase();
  for (const r of rules) {
    const p = r.pattern.trim().toLowerCase();
    if (p && d.includes(p)) return r.categoryId;
  }
  return null;
}
