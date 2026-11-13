import { describe, expect, it } from "vitest";
import { parsePurchase } from "@/lib/purchase";

describe("parsePurchase", () => {
  it("aceita número, texto brasileiro e R$", () => {
    expect(parsePurchase({ description: "UBER *TRIP", amount: 45.9 })).toMatchObject({ ok: true, value: { amountCents: 4590 } });
    expect(parsePurchase({ description: "x", amount: "1.234,56" })).toMatchObject({ ok: true, value: { amountCents: 123456 } });
    expect(parsePurchase({ description: "x", amount: "R$ 45,90" })).toMatchObject({ ok: true, value: { amountCents: 4590 } });
  });
  it("valor negativo vira positivo (compra)", () => {
    expect(parsePurchase({ description: "x", amount: -10 })).toMatchObject({ ok: true, value: { amountCents: 1000 } });
  });
  it("recusa sem descrição, valor zero ou data torta", () => {
    expect(parsePurchase({ amount: 1 }).ok).toBe(false);
    expect(parsePurchase({ description: "x", amount: 0 }).ok).toBe(false);
    expect(parsePurchase({ description: "x", amount: 1, date: "12/11/2026" }).ok).toBe(false);
    expect(parsePurchase(null).ok).toBe(false);
  });
});
