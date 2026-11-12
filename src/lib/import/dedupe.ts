import { createHash } from "node:crypto";
import type { ParsedRow } from "./types";

/**
 * Identificador estável para não importar a mesma transação duas vezes.
 * OFX: usa o FITID do banco. CSV: usa data, valor e descrição, mais a ordem em que a
 * combinação aparece no arquivo (duas compras iguais no mesmo dia continuam sendo duas).
 */
export function externalIds(rows: ParsedRow[], format: "ofx" | "csv"): string[] {
  const seen = new Map<string, number>();
  // Alguns bancos repetem o FITID (há banco que usa o mesmo na compra e nos estornos dela).
  // Nesses casos o identificador também leva data, valor e descrição.
  const fitCount = new Map<string, number>();
  for (const r of rows) if (r.bankId) fitCount.set(r.bankId, (fitCount.get(r.bankId) ?? 0) + 1);
  return rows.map((r) => {
    if (format === "ofx" && r.bankId && fitCount.get(r.bankId) === 1) return `ofx:${r.bankId}`;
    const key = `${r.date}|${r.amountCents}|${r.description.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const hash = createHash("sha256").update(r.bankId ? `${r.bankId}|${key}|${n}` : `${key}|${n}`).digest("hex").slice(0, 32);
    return `${format}:${hash}`;
  });
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** O texto contém o nome? Nomes curtos (até 3 letras, como "99") só valem como palavra inteira, para não achar "99" dentro de "1999". */
const contains = (text: string, p: string) =>
  p.length > 3 ? text.includes(p) : new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(text);

/**
 * Aplica as regras "descrição contém texto → categoria", sem diferença de acento ou maiúsculas.
 * Quando mais de uma bate, vence a mais específica (o texto mais longo): "uber eats" ganha de "uber".
 */
export function matchCategory(
  description: string,
  rules: { pattern: string; categoryId: string }[],
): string | null {
  const d = fold(description);
  let best: { len: number; categoryId: string } | null = null;
  for (const r of rules) {
    const p = fold(r.pattern).trim();
    if (p && contains(d, p) && (!best || p.length > best.len)) best = { len: p.length, categoryId: r.categoryId };
  }
  return best?.categoryId ?? null;
}
