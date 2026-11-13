import { describe, expect, it } from "vitest";
import { statement } from "@/lib/statement";

describe("extrato do mês", () => {
  it("saldo final = inicial + receitas - despesas", () => {
    const s = statement({ initialCents: 100_00, incomeCents: 500_00, spentCents: 300_00, owedToMeCents: 0, iOweCents: 0 });
    expect(s.final).toBe(300_00);
    expect(s.result).toBe(200_00);
    expect(s.hasGap).toBe(false);
    expect(s.inPocket).toBe(s.final);
  });
  it("o que te devem sai do bolso até pagarem; o que você deve ainda está no bolso", () => {
    const s = statement({ initialCents: 0, incomeCents: 1000_00, spentCents: 400_00, owedToMeCents: 150_00, iOweCents: 30_00 });
    expect(s.final).toBe(600_00);
    expect(s.inPocket).toBe(600_00 - 150_00 + 30_00);
    expect(s.settled).toBe(600_00);
    expect(s.hasGap).toBe(true);
  });
  it("saldo pode ficar negativo", () => {
    expect(statement({ initialCents: -50_00, incomeCents: 0, spentCents: 20_00, owedToMeCents: 0, iOweCents: 0 }).final).toBe(-70_00);
  });
});
