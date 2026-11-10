import { stateLabel, txState } from "@/lib/tx-state";
import { firstDateOf, planSeries, scaleSplits } from "@/lib/series-plan";
import { merchantKey, parseInstallment, recurringMerchants } from "@/lib/import/patterns";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { computeBalances, pairwiseFor, pairwiseSettlements, suggestSettlements } from "@/lib/balances";
import { parseAmountToCents, splitEqually } from "@/lib/money";
import { parseOfx, normalizeOfxText } from "@/lib/import/ofx";
import { applyCsvMapping, guessMapping, parseDate, readCsvTable } from "@/lib/import/csv";
import { externalIds, matchCategory } from "@/lib/import/dedupe";
import { defaultHouseholdName, HOUSEHOLD_NAME_MAX } from "@/lib/defaults";
import { explainTx, missingInfo } from "@/lib/explain";
import { describeImpact } from "@/lib/impact";
import { dueOccurrences, endOfMonth } from "@/lib/recurring";
import { addMonthsIso, buildSeries, cardAlerts, cardSchedule, competenceMonth, invoiceDates, invoiceMonth, invoiceOf, invoiceRange, suggestDueDay, todayIn } from "@/lib/cards";

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
  const base = { kind: "expense" as const, settled: false };
  test("despesa paga por uma pessoa e dividida entre três", () => {
    const net = computeBalances([
      { ...base, amountCents: 9000, payerId: "eu", splits: [
        { participantId: "eu", amountCents: 3000 },
        { participantId: "ciclano", amountCents: 3000 },
        { participantId: "nam", amountCents: 3000 },
      ] },
    ]);
    expect(net.get("eu")).toBe(6000);
    expect(net.get("ciclano")).toBe(-3000);
    expect(net.get("nam")).toBe(-3000);
    expect(suggestSettlements(net)).toEqual([
      { fromId: "ciclano", toId: "eu", amountCents: 3000 },
      { fromId: "nam", toId: "eu", amountCents: 3000 },
    ]);
  });
  test("pendente já conta; só acertado sai do saldo", () => {
    const split = [{ participantId: "ciclano", amountCents: 100 }];
    const net = computeBalances([
      { ...base, settled: false, amountCents: 100, payerId: "eu", splits: split },
      { ...base, settled: true, amountCents: 100, payerId: "eu", splits: split },
    ]);
    expect(net.get("eu")).toBe(100);
    expect(net.get("ciclano")).toBe(-100);
  });
  test("sem quem pagou não gera dívida", () => {
    const net = computeBalances([{ ...base, settled: false, amountCents: 100, payerId: null, splits: [{ participantId: "ciclano", amountCents: 100 }] }]);
    expect(net.size).toBe(0);
  });
  test("empréstimo: quem pegou emprestado deve para quem emprestou", () => {
    const net = computeBalances([
      { kind: "loan", settled: false, amountCents: 2040, payerId: "eu", splits: [{ participantId: "beltrano", amountCents: 2040 }] },
    ]);
    expect(net.get("eu")).toBe(2040);
    expect(net.get("beltrano")).toBe(-2040);
    expect(suggestSettlements(net)).toEqual([{ fromId: "beltrano", toId: "eu", amountCents: 2040 }]);
  });
  test("acerto zera a dívida", () => {
    const net = computeBalances([
      { ...base, amountCents: 5000, payerId: "eu", splits: [{ participantId: "ciclano", amountCents: 5000 }] },
      { kind: "transfer", settled: false, amountCents: 5000, payerId: "ciclano", splits: [{ participantId: "eu", amountCents: 5000 }] },
    ]);
    expect(net.get("eu")).toBe(0);
    expect(net.get("ciclano")).toBe(0);
  });
  test("receita recebida por um e dividida gera dívida de quem recebeu", () => {
    const net = computeBalances([
      { kind: "income", settled: false, amountCents: 1000, payerId: "eu", splits: [
        { participantId: "eu", amountCents: 500 }, { participantId: "ciclano", amountCents: 500 },
      ] },
    ]);
    expect(net.get("eu")).toBe(-500);
    expect(net.get("ciclano")).toBe(500);
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
  test("fatura do Cartão A: compras positivas viram saídas", () => {
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
  const cartaoA = { closingDay: 15, dueDay: 22 };
  test("compra antes do fechamento entra na fatura do mês; no dia ou depois, na seguinte", () => {
    expect(invoiceOf("2026-11-14", 15)).toBe("2026-11");
    expect(invoiceOf("2026-11-15", 15)).toBe("2026-12");
    expect(invoiceOf("2026-12-20", 15)).toBe("2027-01");
  });
  test("vencimento no mesmo mês ou no seguinte", () => {
    expect(invoiceDates("2026-11", cartaoA)).toEqual({ closing: "2026-11-15", due: "2026-11-22" });
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
    const s = cardSchedule(cartaoA, "2026-11-18");
    expect(s).toMatchObject({ open: "2026-12", closingDate: "2026-12-15", dueInvoice: "2026-11", dueDate: "2026-11-22", daysToDue: 4 });
    // Depois do vencimento, a próxima a vencer é a aberta.
    expect(cardSchedule(cartaoA, "2026-11-25")).toMatchObject({ dueInvoice: "2026-12", dueDate: "2026-12-22" });
  });
  test("avisos dentro da antecedência", () => {
    const card = { ...cartaoA, id: "c", name: "Cartão A", color: "#000000", alertDays: 3 };
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

describe("OFX de cartão de crédito", () => {
  const r = parseOfx(fx("cartao-nubank.ofx"));
  test("lê as transações da fatura", () => {
    expect(r.statement).toBe("card");
    expect(r.rows).toHaveLength(6);
    expect(r.rows[0]).toEqual({ date: "2026-03-02", description: "Padaria Exemplo", amountCents: -700, bankId: "aaaa-0001" });
    expect(r.rows[1].description).toBe('Estorno de "Hotel Exemplo"');
  });
  test("FITID repetido não vira duplicata", () => {
    const ids = externalIds(r.rows, "ofx");
    expect(new Set(ids).size).toBe(6);
    expect(ids[0]).toBe("ofx:aaaa-0001");
    // Reimportar o mesmo arquivo gera os mesmos identificadores.
    expect(externalIds(parseOfx(fx("cartao-nubank.ofx")).rows, "ofx")).toEqual(ids);
  });
  test("extrato de conta continua igual", () => {
    expect(parseOfx(fx("extrato.ofx")).statement).toBe("bank");
  });
});

describe("nome da família", () => {
  test("padrão cabe em 20 caracteres", () => {
    expect(defaultHouseholdName("Fulano de Tal")).toBe("Família de Fulano");
    expect(defaultHouseholdName("Maximiliano Souza").length).toBeLessThanOrEqual(HOUSEHOLD_NAME_MAX);
    expect(HOUSEHOLD_NAME_MAX).toBe(20);
  });
});

describe("recorrência sem fim", () => {
  test("cria do próximo número até o fim do mês corrente", () => {
    expect(dueOccurrences("2026-09-05", 1, "2026-11-30")).toEqual([
      { index: 1, date: "2026-09-05" },
      { index: 2, date: "2026-10-05" },
      { index: 3, date: "2026-11-05" },
    ]);
    expect(dueOccurrences("2026-09-05", 4, "2026-11-30")).toEqual([]);
    expect(dueOccurrences("2026-12-10", 1, "2026-11-30")).toEqual([]);
  });
  test("dia 31 cai no último dia dos meses curtos", () => {
    expect(dueOccurrences("2027-01-31", 2, "2027-02-28")).toEqual([{ index: 2, date: "2027-02-28" }]);
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
  });
});

describe("visão de um membro (só entre ele e cada pessoa)", () => {
  test("despesa paga por mim e dividida; empréstimo; receita", () => {
    const rows = [
      { kind: "expense" as const, settled: false, amountCents: 9000, payerId: "eu", splits: [
        { participantId: "eu", amountCents: 3000 }, { participantId: "ciclano", amountCents: 3000 }, { participantId: "beltrano", amountCents: 3000 },
      ] },
      { kind: "expense" as const, settled: false, amountCents: 1000, payerId: "ciclano", splits: [{ participantId: "eu", amountCents: 1000 }] },
      { kind: "loan" as const, settled: false, amountCents: 500, payerId: "beltrano", splits: [{ participantId: "ciclano", amountCents: 500 }] },
      { kind: "income" as const, settled: false, amountCents: 200, payerId: "eu", splits: [{ participantId: "beltrano", amountCents: 200 }] },
    ];
    const net = pairwiseFor("eu", rows);
    expect(net.get("ciclano")).toBe(2000); // mãe me deve 3000, eu devo 1000
    expect(net.get("beltrano")).toBe(2800); // clara me deve 3000, eu devo 200 da receita
    expect(pairwiseSettlements("eu", net)).toEqual([
      { fromId: "beltrano", toId: "eu", amountCents: 2800 },
      { fromId: "ciclano", toId: "eu", amountCents: 2000 },
    ]);
  });
});

describe("o que o lançamento muda", () => {
  const base = {
    kind: "expense" as const,
    amountCents: 9000,
    payerId: "eu",
    shares: [
      { participantId: "eu", cents: 3000 },
      { participantId: "beltrano", cents: 3000 },
      { participantId: "ciclano", cents: 3000 },
    ],
    me: "eu",
    names: { eu: "Fulano", beltrano: "Beltrano", ciclano: "Ciclano" },
    settled: false,
    card: null,
    date: "2026-11-05",
    repeat: "once" as const,
    count: null,
    categoryName: "Mercado",
    today: "2026-11-08",
  };
  const by = (r: ReturnType<typeof describeImpact>, a: string) => (r.find((x) => x.area === a)?.lines ?? []).map((l) => l.replace(/\u00a0/g, " "));
  test("despesa paga e dividida gera dívida e gasto, mas não fica em A pagar", () => {
    const r = describeImpact(base);
    expect(by(r, "debts")).toEqual(["Beltrano fica devendo R$ 30,00 para você.", "Ciclano fica devendo R$ 30,00 para você."]);
    expect(by(r, "panel")[0]).toBe("Soma em Gastos de nov/2026, em Mercado.");
  });
  test("acertado ou sem quem pagou não geram dívida", () => {
    expect(by(describeImpact({ ...base, settled: true }), "debts")[0]).toMatch(/não gera dívida/);
    expect(by(describeImpact({ ...base, payerId: null }), "debts")[0]).toMatch(/não gera dívida/);
  });
  test("parcelado no cartão: parcela por fatura e dívida por parcela", () => {
    const r = describeImpact({ ...base, amountCents: 240000, shares: [{ participantId: "eu", cents: 120000 }, { participantId: "beltrano", cents: 120000 }], card: { name: "Cartão A", closingDay: 10, dueDay: 17 }, repeat: "installment", count: 10 });
    expect(by(r, "debts")[0]).toBe("Beltrano fica devendo R$ 120,00 por parcela para você.");
    expect(by(r, "card")[0]).toBe("R$ 240,00 por fatura do Cartão A, de 17/11 até 17/08/27.");
  });
  test("empréstimo e acerto não contam como gasto", () => {
    const loan = describeImpact({ ...base, kind: "loan", amountCents: 2040, shares: [{ participantId: "beltrano", cents: 2040 }] });
    expect(by(loan, "debts")).toEqual(["Beltrano fica devendo R$ 20,40 para você."]);
    expect(by(loan, "panel")[0]).toMatch(/Não conta como gasto/);
    const pay = describeImpact({ ...base, kind: "transfer", payerId: "beltrano", amountCents: 1000, shares: [{ participantId: "eu", cents: 1000 }] });
    expect(by(pay, "debts")).toEqual(["Abate R$ 10,00 do que Beltrano deve para você."]);
  });
});

describe("frase embaixo do lançamento", () => {
  const base = { kind: "expense", amountCents: 9000, payerId: "f", cardName: null, settled: false, me: "f", names: { f: "Fulano", c: "Beltrano", m: "Ciclano" } };
  const t = (x: Partial<Parameters<typeof explainTx>[0]>) => explainTx({ ...base, splits: [], ...x }).replace(/ /g, " ");
  test("despesa paga e dividida, no cartão", () => {
    expect(t({ cardName: "Cartão A", splits: [{ participantId: "f", amountCents: 4500 }, { participantId: "c", amountCents: 4500 }] })).toBe(
      "Você comprou no cartão Cartão A · falta você receber de: Beltrano (R$ 45,00)",
    );
  });
  test("conta toda de outra pessoa: em aberto, já paga e acertada no modelo antigo", () => {
    expect(t({ splits: [{ participantId: "m", amountCents: 9000 }] })).toBe("Pago por você · falta você receber de: Ciclano (R$ 90,00)");
    expect(t({ splits: [{ participantId: "m", amountCents: 9000, paidById: "x" }] })).toBe("Pago por você");
    expect(t({ settled: true, splits: [{ participantId: "m", amountCents: 9000 }] })).toBe("Pago por você · já acertado");
  });
  test("só de quem pagou e sem quem pagou", () => {
    expect(t({ splits: [{ participantId: "f", amountCents: 9000 }] })).toBe("Pago por você · só de você, ninguém precisa reembolsar");
    expect(t({ payerId: null, splits: [{ participantId: "c", amountCents: 9000 }] })).toBe("Falta dizer quem pagou · de quem é: Beltrano (R$ 90,00)");
  });
  test("empréstimo, acerto e receita", () => {
    expect(t({ kind: "loan", amountCents: 5000, splits: [{ participantId: "c", amountCents: 5000 }] })).toBe("Emprestado por você · Beltrano deve devolver R$ 50,00");
    expect(t({ kind: "transfer", payerId: "c", amountCents: 3000, splits: [{ participantId: "f", amountCents: 3000 }] })).toBe("Beltrano pagou R$ 30,00 para você (acerto)");
    expect(t({ kind: "income", amountCents: 4000, splits: [{ participantId: "f", amountCents: 2000 }, { participantId: "c", amountCents: 2000 }] })).toBe(
      "Recebido por você · deve repassar para Beltrano (R$ 20,00)",
    );
  });
});

describe("missingInfo (A identificar)", () => {
  const base = { kind: "expense", categoryId: "cat", payerId: "f", splits: [{ participantId: "f" }] };
  test("identificado não falta nada", () => expect(missingInfo(base)).toEqual([]));
  test("importado sem nada", () =>
    expect(missingInfo({ ...base, categoryId: null, payerId: null, splits: [] })).toEqual(["categoria", "quem pagou", "quem deveria pagar"]));
  test("receita usa outras palavras", () => expect(missingInfo({ ...base, kind: "income", payerId: null })).toEqual(["quem recebeu"]));
  test("empréstimo e acerto nunca entram", () => expect(missingInfo({ ...base, kind: "loan", categoryId: null })).toEqual([]));
});

describe("status automático", () => {
  const split = (...ids: string[]) => ids.map((participantId) => ({ participantId, amountCents: 100 }));
  test("cada caso cai no status certo", () => {
    expect(txState({ kind: "expense", payerId: null, settled: false, splits: split("eu") })).toBe("to-pay");
    expect(txState({ kind: "expense", payerId: "ciclano", settled: false, splits: split("eu") })).toBe("to-settle");
    expect(txState({ kind: "expense", payerId: "eu", settled: false, splits: split("eu") })).toBe("paid");
    expect(txState({ kind: "expense", payerId: "ciclano", settled: true, splits: split("eu") })).toBe("paid");
    expect(txState({ kind: "loan", payerId: "eu", settled: false, splits: split("beltrano") })).toBe("to-settle");
    expect(txState({ kind: "transfer", payerId: "eu", settled: true, splits: split("ciclano") })).toBe("paid");
  });
  test("compra no cartão segue a fatura, mesmo com alguém devendo", () => {
    const c = { kind: "expense", payerId: "eu", settled: false, cardId: "cartaoA", splits: split("ciclano") };
    expect(txState({ ...c, invoicePaid: false })).toBe("on-card");
    expect(txState({ ...c, invoicePaid: true })).toBe("paid");
  });
  test("parte paga com acerto sai da dívida e do status", () => {
    const paid = [{ participantId: "ciclano", amountCents: 2000, paidById: "acerto" }];
    expect(txState({ kind: "expense", payerId: "eu", settled: false, splits: paid })).toBe("paid");
    expect(txState({ kind: "expense", payerId: "eu", settled: false, splits: [...paid, { participantId: "beltrano", amountCents: 100 }] })).toBe("to-settle");
  });
  test("receita usa nomes próprios", () => {
    expect(stateLabel("to-pay", "income")).toBe("Falta quem recebeu");
    expect(stateLabel("to-settle", "income")).toBe("A repassar");
    expect(stateLabel("to-settle", "expense")).toBe("A acertar");
  });
});

describe("pagamento de dívida com lucro", () => {
  test("a mãe devia R$ 20,00 e pagou R$ 30,00: a dívida some e os R$ 10,00 não viram dívida ao contrário", () => {
    const remedio = { amountCents: 2000, kind: "expense" as const, payerId: "eu", settled: false, splits: [{ participantId: "ciclano", amountCents: 2000, paidById: "acerto" }] };
    const acerto = { amountCents: 3000, kind: "transfer" as const, payerId: "ciclano", settled: false, settlesId: "remedio", splits: [{ participantId: "eu", amountCents: 3000 }] };
    expect([...computeBalances([remedio, acerto]).values()].every((v) => v === 0)).toBe(true);
    expect(pairwiseFor("eu", [remedio, acerto]).size).toBe(0);
  });
  test("sem o acerto, a mãe continua devendo", () => {
    const remedio = { amountCents: 2000, kind: "expense" as const, payerId: "eu", settled: false, splits: [{ participantId: "ciclano", amountCents: 2000 }] };
    expect(computeBalances([remedio]).get("ciclano")).toBe(-2000);
  });
});

describe("parcelas e compras repetidas no extrato", () => {
  test("reconhece parcela", () => {
    expect(parseInstallment("Mercadolivre*Mercadol - Parcela 1/10")).toEqual({ base: "Mercadolivre*Mercadol", index: 1, total: 10 });
    expect(parseInstallment("LOJA X PARC 03/10")).toEqual({ base: "LOJA X", index: 3, total: 10 });
    expect(parseInstallment("Viacao Cidade Sol")).toBeNull();
    expect(parseInstallment("Compra 3/10")).toBeNull();
  });
  test("mesmo estabelecimento, com ou sem parcela e NuPay", () => {
    expect(merchantKey("Viacao Cidade Sol - Parcela 1/2")).toBe(merchantKey("Viacao Cidade Sol"));
    expect(merchantKey("99Food - NuPay")).toBe("99food");
    expect(merchantKey("Panificadora Super Pão")).toBe("panificadora super pao");
  });
  test("recorrente = aparece em meses diferentes", () => {
    const r = recurringMerchants([
      { description: "EBW*Spotify - NuPay", date: "2026-09-25" },
      { description: "EBW*Spotify - NuPay", date: "2026-10-25" },
      { description: "Posto Brx", date: "2026-10-26" },
      { description: "Posto Brx", date: "2026-10-28" },
      { description: "Loja - Parcela 1/3", date: "2026-09-01" },
      { description: "Loja - Parcela 2/3", date: "2026-10-01" },
    ]);
    expect([...r]).toEqual(["ebw spotify"]);
  });
});

describe("mudar o parcelamento depois de criado", () => {
  const items = [
    { id: "a", index: 1, date: "2026-10-24", amountCents: 33851, source: "ofx" },
    { id: "b", index: 2, date: "2026-11-24", amountCents: 33851, source: "previsto" },
    { id: "c", index: 3, date: "2026-12-24", amountCents: 33851, source: "previsto" },
  ];
  test("a 1ª parcela pode estar antes da importação", () => {
    expect(firstDateOf([{ id: "x", index: 3, date: "2026-10-03", amountCents: 1, source: "ofx" }])).toBe("2026-08-03");
  });
  test("mais parcelas e outra data: o extrato fica, as previstas se ajustam, as novas são criadas", () => {
    const p = planSeries(items, { total: 4, firstDate: "2026-10-10", amountCents: null });
    expect(p.error).toBeNull();
    expect(p.steps.map((s) => [s.action, s.index, s.date])).toEqual([
      ["keep", 1, "2026-10-24"],
      ["update", 2, "2026-11-10"],
      ["update", 3, "2026-12-10"],
      ["create", 4, "2027-01-10"],
    ]);
  });
  test("menos parcelas apaga as do fim, mas nunca uma que veio do extrato", () => {
    expect(planSeries(items, { total: 2, firstDate: "2026-10-24", amountCents: null }).remove.map((r) => r.id)).toEqual(["c"]);
    const real = items.map((x) => ({ ...x, source: "ofx" }));
    expect(planSeries(real, { total: 2, firstDate: "2026-10-24", amountCents: null }).error).toMatch(/mínimo é 3/);
  });
  test("divisão acompanha o valor novo", () => {
    expect(scaleSplits([{ participantId: "eu", amountCents: 50 }, { participantId: "ciclano", amountCents: 50 }], 101)).toEqual([
      { participantId: "eu", amountCents: 51 },
      { participantId: "ciclano", amountCents: 50 },
    ]);
  });
});

describe("mês da compra = mês em que é paga", () => {
  const cartaoA = { closingDay: 3, dueDay: 10 };
  const outro = { closingDay: 15, dueDay: 22 };
  test("sem cartão é o mês da data", () => expect(competenceMonth("2026-11-02", null)).toBe("2026-11"));
  test("Cartão A (fecha 3, vence 10): compras de 03/10 a 02/11 são da fatura de novembro", () => {
    expect(competenceMonth("2026-10-03", cartaoA)).toBe("2026-11");
    expect(competenceMonth("2026-11-02", cartaoA)).toBe("2026-11");
    expect(competenceMonth("2026-11-03", cartaoA)).toBe("2026-12");
  });
  test("cartões com fechamentos diferentes caem no mês do vencimento", () => {
    expect(competenceMonth("2026-10-20", outro)).toBe("2026-11");
    expect(competenceMonth("2026-11-10", outro)).toBe("2026-11");
  });
  test("vencimento antes do fechamento vence no mês seguinte", () => {
    expect(competenceMonth("2026-10-10", { closingDay: 28, dueDay: 5 })).toBe("2026-11");
    expect(invoiceMonth("2026-11", cartaoA)).toBe("2026-11");
  });
});

describe("confirmação de membros", () => {
  const base = { amountCents: 100_00, kind: "expense" as const, payerId: "a", settled: false, splits: [{ participantId: "a", amountCents: 50_00 }, { participantId: "b", amountCents: 50_00 }] };
  test("esperando aceitar não mexe nas dívidas", () => {
    expect(computeBalances([{ ...base, blocked: true }]).size).toBe(0);
    expect(pairwiseFor("a", [{ ...base, blocked: true }]).size).toBe(0);
  });
  test("depois de aceito, vale normalmente", () => {
    const net = computeBalances([{ ...base, blocked: false }]);
    expect(net.get("a")).toBe(50_00);
    expect(net.get("b")).toBe(-50_00);
  });
});

describe("frase do que foi imposto", () => {
  const names = (id: string | null) => ({ a: "Ana", b: "Bia" })[id as "a"] ?? "alguém";
  test("despesa dividida e dívida", async () => {
    const { roleSentence } = await import("@/lib/approval-text");
    expect(roleSentence({ kind: "expense", amountCents: 80_00, payerId: "a", splits: [{ participantId: "a", amountCents: 40_00 }, { participantId: "b", amountCents: 40_00 }] }, "b", names, "BRL")).toMatch(/Você deve R\$\s?40,00 para Ana/);
    expect(roleSentence({ kind: "loan", amountCents: 560_00, payerId: "a", splits: [{ participantId: "b", amountCents: 560_00 }] }, "b", names, "BRL")).toMatch(/Você deve R\$\s?560,00 para Ana/);
    expect(roleSentence({ kind: "transfer", amountCents: 40_00, payerId: "b", splits: [{ participantId: "a", amountCents: 40_00 }] }, "a", names, "BRL")).toMatch(/Bia te pagou/);
  });
});
