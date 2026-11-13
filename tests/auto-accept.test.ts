import { describe, expect, it } from "vitest";
import { ruleApplies, type AutoRule } from "@/lib/auto-accept";

const rule = (o: Partial<AutoRule> = {}): AutoRule => ({ id: "r", participantId: "eu", fromParticipantId: "ana", maxCents: null, match: null, ...o });
const tx = (o = {}) => ({ creatorId: "ana", description: "Aluguel de Novembro", amountCents: 100000, splits: [{ participantId: "eu", amountCents: 50000 }], ...o });

describe("ruleApplies", () => {
  it("só vale para quem lançou", () => {
    expect(ruleApplies(rule(), tx())).toBe(true);
    expect(ruleApplies(rule(), tx({ creatorId: "bob" }))).toBe(false);
  });
  it("limite é sobre a minha parte", () => {
    expect(ruleApplies(rule({ maxCents: 50000 }), tx())).toBe(true);
    expect(ruleApplies(rule({ maxCents: 49999 }), tx())).toBe(false);
  });
  it("texto na descrição ignora maiúsculas e acentos", () => {
    expect(ruleApplies(rule({ match: "ALUGUEL" }), tx())).toBe(true);
    expect(ruleApplies(rule({ match: "mercado" }), tx())).toBe(false);
  });
});
