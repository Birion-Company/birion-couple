import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { computeBalances, suggestSettlements } from "@/lib/balances";
import { parseAmountToCents, splitEqually } from "@/lib/money";
import { parseOfx, normalizeOfxText } from "@/lib/import/ofx";
import { applyCsvMapping, guessMapping, parseDate, readCsvTable } from "@/lib/import/csv";
import { externalIds, matchCategory } from "@/lib/import/dedupe";
import { addMonthsIso, buildSeries, cardAlerts, cardSchedule, invoiceDates, invoiceOf, invoiceRange, suggestDueDay, todayIn } from "@/lib/cards";

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

describe("cartão de crédito", () => {
  const nubank = { closingDay: 15, dueDay: 22 };
  test("compra antes do fechamento entra na fatura do mês; no dia ou depois, na seguinte", () => {
    expect(invoiceOf("2026-11-14", 15)).toBe("2026-11");
    expect(invoiceOf("2026-11-15", 15)).toBe("2026-12");
    expect(invoiceOf("2026-12-20", 15)).toBe("2027-01");
  });
  test("vencimento no mesmo mês ou no seguinte", () => {
    expect(invoiceDates("2026-11", nubank)).toEqual({ closing: "2026-11-15", due: "2026-11-22" });
    expect(invoiceDates("2026-11", { closingDay: 28, dueDay: 5 })).toEqual({ closing: "2026-11-28", due: "2026-12-05" });
  });
  test("dias 29–31 viram o último dia em meses curtos", () => {
    expect(invoiceDates("2027-02", { closingDay: 31, dueDay: 7 })).toEqual({ closing: "2027-02-28", due: "2027-03-07" });
    expect(addMonthsIso("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsIso("2026-11-10", 13)).toBe("2027-12-10");
  });
  test("período de compras da fatura", () => {
    expect(invoiceRange("2026-12", 15)).toEqual({ from: "2026-11-15", to: "2026-12-14" });
  });
  test("sugere vencimento uma semana depois do fechamento", () => {
    expect(suggestDueDay(15)).toBe(22);
    expect(suggestDueDay(28)).toBe(4);
  });
  test("situação de hoje: fatura aberta e próxima a vencer", () => {
    // Entre o fechamento (15) e o vencimento (22): a fatura de novembro já fechou e vence dia 22.
    const s = cardSchedule(nubank, "2026-11-18");
    expect(s).toMatchObject({ open: "2026-12", closingDate: "2026-12-15", dueInvoice: "2026-11", dueDate: "2026-11-22", daysToDue: 4 });
    // Depois do vencimento, a próxima a vencer é a aberta.
    expect(cardSchedule(nubank, "2026-11-25")).toMatchObject({ dueInvoice: "2026-12", dueDate: "2026-12-22" });
  });
  test("avisos dentro da antecedência", () => {
    const card = { ...nubank, id: "c", name: "Nubank", color: "#000000", alertDays: 3 };
    const total = () => 50000;
    expect(cardAlerts(card, "2026-11-13", total).map((a) => [a.type, a.daysLeft])).toEqual([["closing", 2]]);
    expect(cardAlerts(card, "2026-11-20", total).map((a) => [a.type, a.daysLeft])).toEqual([["due", 2]]);
    expect(cardAlerts(card, "2026-11-05", total)).toEqual([]);
    expect(cardAlerts({ ...card, alertDays: null }, "2026-11-13", total)).toEqual([]);
    // Fatura zerada não gera aviso.
    expect(cardAlerts(card, "2026-11-20", () => 0)).toEqual([]);
    expect(cardAlerts(card, "2026-11-13", () => 0)).toEqual([]);
  });
  test("notebook de R$ 3.500 em 10x dividido entre duas pessoas", () => {
    const parts = buildSeries("2026-11-10", "installment", 10, 350000, [
      { participantId: "eu", amountCents: 175000 },
      { participantId: "irmao", amountCents: 175000 },
    ]);
    expect(parts).toHaveLength(10);
    expect(parts.every((p) => p.amountCents === 35000)).toBe(true);
    expect(parts[0].splits).toEqual([{ participantId: "eu", amountCents: 17500 }, { participantId: "irmao", amountCents: 17500 }]);
    expect(parts.map((p) => p.date).slice(0, 3)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
  });
  test("parcelas sem perder centavos", () => {
    const parts = buildSeries("2026-11-10", "installment", 3, 10000, [
      { participantId: "a", amountCents: 6667 },
      { participantId: "b", amountCents: 3333 },
    ]);
    expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(10000);
    for (const p of parts) expect(p.splits.reduce((s, x) => s + x.amountCents, 0)).toBe(p.amountCents);
  });
  test("recorrente repete o valor todo mês", () => {
    const parts = buildSeries("2026-11-05", "monthly", 12, 5590, [{ participantId: "a", amountCents: 5590 }]);
    expect(parts).toHaveLength(12);
    expect(parts.every((p) => p.amountCents === 5590)).toBe(true);
    expect(parts[11].date).toBe("2027-10-05");
  });
  test("data de hoje no fuso de Brasília", () => {
    expect(todayIn("America/Sao_Paulo", new Date("2026-11-08T02:00:00Z"))).toBe("2026-11-07");
  });
});
