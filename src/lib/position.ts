/** "Minha posição": quanto tenho agora, o que pago e quando, do que dependo dos outros e o saldo que sobra. Puro, sem banco. */
export type PositionInput = {
  accountsCents: number[];
  /** Faturas do mês visto: só a parte da pessoa, e se já foi paga. */
  invoices: { mineCents: number; paid: boolean; due: string }[];
  /** Saldo com cada pessoa: positivo = ela me deve, negativo = eu devo. */
  debts: { net: number }[];
  /** O que me devem e vence até o fim do mês visto. */
  receivableMonthCents: number;
};

export function position(i: PositionInput) {
  const have = i.accountsCents.reduce((a, v) => a + v, 0);
  const open = i.invoices.filter((v) => !v.paid && v.mineCents > 0);
  const payInvoices = open.reduce((a, v) => a + v.mineCents, 0);
  const payDebts = i.debts.reduce((a, d) => a + (d.net < 0 ? -d.net : 0), 0);
  const receive = Math.max(0, i.receivableMonthCents);
  const projected = have - payInvoices - payDebts;
  return {
    have,
    payInvoices,
    payDebts,
    receive,
    projected,
    /** Se todo mundo que deve pagar até o fim do mês, quanto sobra. */
    projectedWithReceive: projected + receive,
    nextDue: open.map((v) => v.due).sort()[0] ?? null,
  };
}
