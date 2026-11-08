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

/** Valor de uma tag OFX dentro de um bloco (aceita SGML sem fechamento e XML). */
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  if (!m) return null;
  return m[1]
    .trim()
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Leitura direta dos blocos <STMTTRN>, usada quando a biblioteca não encontra nada
 * (acontece com faturas de cartão, como as do Nubank). Serve para conta e cartão.
 */
export function readStatementBlocks(text: string) {
  const body = normalizeOfxText(text);
  const blocks = body.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0]);
  return blocks.map((b) => ({
    postedAt: tag(b, "DTPOSTED"),
    amount: tag(b, "TRNAMT"),
    fitId: tag(b, "FITID"),
    description: tag(b, "MEMO") || tag(b, "NAME") || tag(b, "TRNTYPE") || "",
  }));
}

export function parseOfx(text: string): ParseResult {
  const issues: ParseResult["issues"] = [];
  const statement = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(text) ? "card" : "bank";
  let list: { postedAt: unknown; amount: unknown; fitId?: string | null; description?: string | null }[] = [];
  try {
    list = new Ofx(normalizeOfxText(text), { parserMode: "lenient" }).toNormalized({ dateMode: "formatted", amountMode: "number" }).transactions;
  } catch {
    list = [];
  }
  if (list.length === 0) list = readStatementBlocks(text);
  if (list.length === 0 && !/<STMTTRN>/i.test(text)) {
    return { rows: [], issues: [{ line: 0, message: /<OFX>/i.test(text) ? "Nenhuma transação encontrada no arquivo." : "Não foi possível ler este arquivo OFX." }], statement };
  }
  const rows: ParsedRow[] = [];
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
  return { rows, issues, statement };
}
