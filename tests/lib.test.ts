import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { computeBalances, suggestSettlements } from "@/lib/balances";
import { parseAmountToCents, splitEqually } from "@/lib/money";
import { parseOfx, normalizeOfxText } from "@/lib/import/ofx";
import { applyCsvMapping, guessMapping, parseDate, readCsvTable } from "@/lib/import/csv";
import { externalIds, matchCategory } from "@/lib/import/dedupe";

const fx = (n: string) => readFileSync(`tests/fixtures/${n}`, n.endsWith(".ofx") ? "latin1" : "utf8");

describe("dinheiro", () => {
  test.each([
    ["1.234,56", 123456],
    ["1234.56", 123456],
    ["R$ 45,00", 4500],
    ["-12,30", -1230],
    ["(12.50)", -1250],
    ["1.234", 123400],
    ["0,5", 50],
    ["", null],
    ["abc", null],
  ])("%s -> %s", (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });
  test("divide sem perder centavos", () => {
    expect(splitEqually(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEqually(1000, 3).reduce((a, b) => a + b)).toBe(1000);
  });
});

describe("saldos", () => {
  const base = { kind: "expense" as const, behavior: "open" as const };
  test("despesa paga por uma pessoa e dividida entre três", () => {
    const net = computeBalances([
      { ...base, amountCents: 9000, payerId: "eu", splits: [
        { participantId: "eu", amountCents: 3000 },
        { participantId: "mae", amountCents: 3000 },
        { participantId: "nam", amountCents: 3000 },
      ] },
    ]);
    expect(net.get("eu")).toBe(6000);
    expect(net.get("mae")).toBe(-3000);
    expect(net.get("nam")).toBe(-3000);
    expect(suggestSettlements(net)).toEqual([
      { fromId: "mae", toId: "eu", amountCents: 3000 },
      { fromId: "nam", toId: "eu", amountCents: 3000 },
    ]);
  });
  test("pendente e reembolsado não entram no saldo", () => {
    const split = [{ participantId: "mae", amountCents: 100 }];
    const net = computeBalances([
      { ...base, behavior: "pending", amountCents: 100, payerId: "eu", splits: split },
      { ...base, behavior: "settled", amountCents: 100, payerId: "eu", splits: split },
    ]);
    expect(net.size).toBe(0);
  });
  test("acerto zera a dívida", () => {
    const net = computeBalances([
      { ...base, amountCents: 5000, payerId: "eu", splits: [{ participantId: "mae", amountCents: 5000 }] },
      { kind: "transfer", behavior: "open", amountCents: 5000, payerId: "mae", splits: [{ participantId: "eu", amountCents: 5000 }] },
    ]);
    expect(net.get("eu")).toBe(0);
    expect(net.get("mae")).toBe(0);
  });
  test("receita recebida por um e dividida gera dívida de quem recebeu", () => {
    const net = computeBalances([
      { kind: "income", behavior: "open", amountCents: 1000, payerId: "eu", splits: [
        { participantId: "eu", amountCents: 500 }, { participantId: "mae", amountCents: 500 },
      ] },
    ]);
    expect(net.get("eu")).toBe(-500);
    expect(net.get("mae")).toBe(500);
  });
});

describe("OFX", () => {
  test("lê o extrato de exemplo", () => {
    const { rows, issues } = parseOfx(fx("extrato.ofx"));
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      { date: "2026-11-02", description: "Palacio das Frutas", amountCents: -5130, bankId: "abc-001" },
      { date: "2026-11-03", description: "99 - NuPay", amountCents: -1566, bankId: "abc-002" },
      { date: "2026-11-04", description: "Pix recebido - Maria", amountCents: 20000, bankId: "abc-003" },
    ]);
  });
  test("aceita OFX com tudo na mesma linha", () => {
    const compact = fx("extrato.ofx").replace(/\n(?=<)/g, "");
    expect(normalizeOfxText(compact)).toContain("\n<STMTTRN>");
    expect(parseOfx(compact).rows).toHaveLength(3);
  });
  test("arquivo inválido vira aviso, não erro", () => {
    expect(parseOfx("isto não é ofx").issues.length).toBeGreaterThan(0);
  });
});

describe("CSV", () => {
  test("fatura do Nubank: compras positivas viram saídas", () => {
    const t = readCsvTable(fx("nubank-cartao.csv"));
    const m = guessMapping(t);
    expect(m).toMatchObject({ dateColumn: 0, descriptionColumn: 1, amountColumn: 2, dateFormat: "YYYY-MM-DD", positiveIsExpense: true });
    const { rows } = applyCsvMapping(t, m);
    expect(rows.map((r) => r.amountCents)).toEqual([-5130, -1566, -1566, 50000]);
  });
  test("extrato com débito e crédito separados e ponto e vírgula", () => {
    const t = readCsvTable(fx("banco.csv"));
    const m = guessMapping(t);
    expect(m).toMatchObject({ amountColumn: -1, debitColumn: 2, creditColumn: 3, dateFormat: "DD/MM/YYYY", decimal: "," });
    const { rows, issues } = applyCsvMapping(t, m);
    expect(rows).toEqual([
      { date: "2026-11-02", description: "Mercado", amountCents: -12050 },
      { date: "2026-11-03", description: "Salário", amountCents: 350000 },
    ]);
    expect(issues).toHaveLength(1);
  });
  test("datas", () => {
    expect(parseDate("05/11/26", "DD/MM/YYYY")).toBe("2026-11-05");
    expect(parseDate("11/05/2026", "MM/DD/YYYY")).toBe("2026-11-05");
    expect(parseDate("2026-02-30", "YYYY-MM-DD")).toBeNull();
  });
});

describe("deduplicação e regras", () => {
  test("linhas idênticas recebem ids diferentes e estáveis", () => {
    const rows = applyCsvMapping(readCsvTable(fx("nubank-cartao.csv")), guessMapping(readCsvTable(fx("nubank-cartao.csv")))).rows;
    const a = externalIds(rows, "csv");
    const b = externalIds(rows, "csv");
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(4);
    expect(externalIds(parseOfx(fx("extrato.ofx")).rows, "ofx")[0]).toBe("ofx:abc-001");
  });
  test("regras de categoria", () => {
    const rules = [{ pattern: "nupay", categoryId: "transporte" }, { pattern: "frutas", categoryId: "mercado" }];
    expect(matchCategory("99 - NuPay", rules)).toBe("transporte");
    expect(matchCategory("Palacio das Frutas", rules)).toBe("mercado");
    expect(matchCategory("Outra coisa", rules)).toBeNull();
  });
});
