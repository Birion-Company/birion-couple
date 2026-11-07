import Papa from "papaparse";
import { parseAmountToCents } from "../money";
import type { CsvMapping, DateFormat, ParseResult, ParsedRow } from "./types";

export type CsvTable = { headers: string[]; rows: string[][] };

/** Lê o CSV em uma tabela de textos. Detecta o separador (vírgula, ponto e vírgula ou tab). */
export function readCsvTable(text: string): CsvTable {
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  const data = (result.data as string[][]).map((r) => r.map((c) => (c ?? "").trim()));
  const width = Math.max(0, ...data.map((r) => r.length));
  const rows = data.map((r) => [...r, ...Array(width - r.length).fill("")]);
  return { headers: rows[0] ?? [], rows };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function findColumn(headers: string[], words: string[]): number {
  const h = headers.map(norm);
  for (const w of words) {
    const i = h.findIndex((x) => x === w);
    if (i !== -1) return i;
  }
  for (const w of words) {
    const i = h.findIndex((x) => x.includes(w));
    if (i !== -1) return i;
  }
  return -1;
}

export function detectDateFormat(samples: string[]): DateFormat {
  const s = samples.filter(Boolean);
  if (s.some((v) => /^\d{4}-\d{2}-\d{2}/.test(v))) return "YYYY-MM-DD";
  // Se algum primeiro número passa de 12, é dia primeiro; se o segundo passa de 12, é mês primeiro.
  for (const v of s) {
    const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) return "DD/MM/YYYY";
    if (Number(m[2]) > 12) return "MM/DD/YYYY";
  }
  return "DD/MM/YYYY";
}

function detectDecimal(samples: string[]): "," | "." {
  let comma = 0;
  let dot = 0;
  for (const v of samples) {
    if (/,\d{1,2}$/.test(v.trim())) comma++;
    else if (/\.\d{1,2}$/.test(v.trim())) dot++;
  }
  return comma > dot ? "," : ".";
}

/** Sugere o mapeamento olhando os nomes das colunas e os primeiros valores. */
export function guessMapping(table: CsvTable): CsvMapping {
  const { headers, rows } = table;
  const body = rows.slice(1, 30);
  const dateColumn = findColumn(headers, ["data", "date", "dt", "data lancamento", "data da compra"]);
  const descriptionColumn = findColumn(headers, [
    "descricao",
    "description",
    "title",
    "titulo",
    "historico",
    "memo",
    "estabelecimento",
    "lancamento",
  ]);
  const amountColumn = findColumn(headers, ["valor", "amount", "value", "quantia", "montante"]);
  const debitColumn = amountColumn === -1 ? findColumn(headers, ["debito", "debit", "saida"]) : -1;
  const creditColumn = amountColumn === -1 ? findColumn(headers, ["credito", "credit", "entrada"]) : -1;
  const amountSamples = body.map((r) => r[amountColumn !== -1 ? amountColumn : Math.max(debitColumn, creditColumn)] ?? "");
  // Faturas de cartão (ex.: coluna "title") listam compras como positivas.
  const positives = amountSamples.filter((v) => (parseAmountToCents(v) ?? 0) > 0).length;
  const looksLikeCard = norm(headers.join(" ")).includes("title") || positives > amountSamples.length * 0.8;
  return {
    dateColumn: dateColumn === -1 ? 0 : dateColumn,
    descriptionColumn: descriptionColumn === -1 ? 1 : descriptionColumn,
    amountColumn: amountColumn === -1 && debitColumn === -1 && creditColumn === -1 ? 2 : amountColumn,
    debitColumn,
    creditColumn,
    dateFormat: detectDateFormat(body.map((r) => r[dateColumn === -1 ? 0 : dateColumn] ?? "")),
    decimal: detectDecimal(amountSamples),
    positiveIsExpense: amountColumn !== -1 && looksLikeCard,
    hasHeader: true,
  };
}

export function parseDate(value: string, format: DateFormat): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  if (format === "YYYY-MM-DD") {
    const r = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!r) return null;
    [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else {
    const r = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!r) return null;
    const a = Number(r[1]);
    const b = Number(r[2]);
    y = Number(r[3]);
    if (y < 100) y += 2000;
    [d, m] = format === "DD/MM/YYYY" ? [a, b] : [b, a];
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Aplica o mapeamento e devolve linhas com sinal padronizado (negativo = saída). */
export function applyCsvMapping(table: CsvTable, mapping: CsvMapping): ParseResult {
  const rows: ParsedRow[] = [];
  const issues: ParseResult["issues"] = [];
  const start = mapping.hasHeader ? 1 : 0;
  table.rows.slice(start).forEach((r, i) => {
    const line = i + start + 1;
    const date = parseDate(r[mapping.dateColumn] ?? "", mapping.dateFormat);
    let cents: number | null;
    if (mapping.amountColumn >= 0) {
      cents = parseAmountToCents(r[mapping.amountColumn] ?? "", mapping.decimal);
      if (cents !== null && mapping.positiveIsExpense) cents = -cents;
    } else {
      const debit = mapping.debitColumn >= 0 ? parseAmountToCents(r[mapping.debitColumn] ?? "", mapping.decimal) : null;
      const credit = mapping.creditColumn >= 0 ? parseAmountToCents(r[mapping.creditColumn] ?? "", mapping.decimal) : null;
      if (debit) cents = -Math.abs(debit);
      else if (credit) cents = Math.abs(credit);
      else cents = null;
    }
    const description = (r[mapping.descriptionColumn] ?? "").trim();
    if (!date) {
      issues.push({ line, message: `Data inválida: "${r[mapping.dateColumn] ?? ""}"` });
      return;
    }
    if (cents === null || cents === 0) {
      issues.push({ line, message: "Valor vazio ou inválido." });
      return;
    }
    rows.push({ date, description: description || "Sem descrição", amountCents: cents });
  });
  return { rows, issues };
}
