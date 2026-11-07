import { Ofx } from "ofx-data-extractor";
import { parseAmountToCents } from "../money";
import type { ParseResult, ParsedRow } from "./types";

/**
 * Muitos bancos geram OFX com várias tags na mesma linha, e o leitor só entende uma por linha.
 * Quebramos o corpo antes de cada "<" para aceitar os dois formatos.
 */
export function normalizeOfxText(text: string): string {
  const start = text.search(/<OFX>/i);
  if (start === -1) return text;
  const header = text.slice(0, start);
  const body = text
    .slice(start)
    .replace(/\r/g, "")
    .replace(/([^\n])</g, "$1\n<")
    .replace(/\n[ \t]+</g, "\n<");
  return header.replace(/\r/g, "") + body;
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

export function parseOfx(text: string): ParseResult {
  const issues: ParseResult["issues"] = [];
  let ofx: Ofx;
  try {
    ofx = new Ofx(normalizeOfxText(text), { parserMode: "lenient" });
  } catch {
    return { rows: [], issues: [{ line: 0, message: "Não foi possível ler este arquivo OFX." }] };
  }
  const rows: ParsedRow[] = [];
  const list = ofx.toNormalized({ dateMode: "formatted", amountMode: "number" }).transactions;
  list.forEach((t, i) => {
    const date = toIsoDate(t.postedAt);
    const cents = t.amount === null ? null : parseAmountToCents(t.amount as number | string, ".");
    if (!date || cents === null) {
      issues.push({ line: i + 1, message: "Transação sem data ou valor válido, ignorada." });
      return;
    }
    rows.push({
      date,
      description: (t.description || "Sem descrição").trim(),
      amountCents: cents,
      bankId: t.fitId || undefined,
    });
  });
  if (rows.length === 0 && issues.length === 0) {
    issues.push({ line: 0, message: "Nenhuma transação encontrada no arquivo." });
  }
  return { rows, issues };
}
