import { describe, expect, it } from "vitest";
import { goalPlan } from "@/lib/goals";

describe("goalPlan", () => {
  it("R$ 1.200 em 5 meses com R$ 200 guardados: falta 1.000, 200 por mês", () => {
    const p = goalPlan(120000, 20000, "2027-04", "2026-11");
    expect(p).toMatchObject({ remainingCents: 100000, monthsLeft: 5, perMonthCents: 20000, pct: 16, done: false, late: false });
  });
  it("meta batida", () => {
    expect(goalPlan(10000, 10000, "2026-12", "2026-11")).toMatchObject({ done: true, perMonthCents: 0, pct: 100 });
  });
  it("prazo vencido conta como atrasada e pede tudo agora", () => {
    expect(goalPlan(10000, 0, "2026-09", "2026-11")).toMatchObject({ late: true, monthsLeft: 1, perMonthCents: 10000 });
  });
});

import { matchCategory } from "@/lib/import/dedupe";
describe("matchCategory", () => {
  const rules = [{ pattern: "99", categoryId: "t" }, { pattern: "uber", categoryId: "t" }, { pattern: "uber eats", categoryId: "f" }];
  it("ignora maiúsculas e acha o nome no texto", () => {
    expect(matchCategory("COMPRA UBER *TRIP 123", rules)).toBe("t");
    expect(matchCategory("Uber Eats Restaurante", rules)).toBe("f");
  });
  it("nome curto só como palavra inteira", () => {
    expect(matchCategory("Pagamento 99 Pop", rules)).toBe("t");
    expect(matchCategory("Loja 1999 Ltda", rules)).toBeNull();
  });
});
