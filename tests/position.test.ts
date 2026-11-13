import { describe, expect, it } from "vitest";
import { position } from "@/lib/position";

describe("position", () => {
  it("conta R$ 1.000, fatura R$ 400 dia 10 e R$ 150 a receber", () => {
    const p = position({ accountsCents: [100000], invoices: [{ mineCents: 40000, paid: false, due: "2026-11-10" }], debts: [{ net: 15000 }], receivableMonthCents: 15000 });
    expect(p).toMatchObject({ have: 100000, payInvoices: 40000, payDebts: 0, receive: 15000, projected: 60000, projectedWithReceive: 75000, nextDue: "2026-11-10" });
  });
  it("fatura paga não entra; o que devo desconta", () => {
    const p = position({ accountsCents: [50000, 20000], invoices: [{ mineCents: 9000, paid: true, due: "2026-11-05" }], debts: [{ net: -3000 }, { net: 100 }], receivableMonthCents: 0 });
    expect(p).toMatchObject({ have: 70000, payInvoices: 0, payDebts: 3000, projected: 67000, nextDue: null });
  });
});
