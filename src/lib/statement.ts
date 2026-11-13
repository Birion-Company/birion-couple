/**
 * Extrato do mês: saldo inicial, receitas, despesas e saldo final, mais o que falta entre vocês dois.
 * Puro, sem banco. Valores em centavos, do ponto de vista de quem está vendo.
 */
export type StatementInput = {
  /** Sobra acumulada dos meses anteriores. */
  initialCents: number;
  /** Entradas já recebidas no mês. */
  incomeCents: number;
  /** Sua parte dos gastos do mês. */
  spentCents: number;
  /** Contas do mês que você pagou e o outro ainda deve a sua parte. */
  owedToMeCents: number;
  /** Contas do mês que o outro pagou e você ainda deve a sua parte. */
  iOweCents: number;
};

export function statement(i: StatementInput) {
  const result = i.incomeCents - i.spentCents;
  const final = i.initialCents + result;
  // Pago por você e ainda não devolvido sai do seu bolso; o que você deve ainda não saiu.
  const inPocket = final - i.owedToMeCents + i.iOweCents;
  return {
    initial: i.initialCents,
    income: i.incomeCents,
    spent: i.spentCents,
    result,
    final,
    owedToMe: i.owedToMeCents,
    iOwe: i.iOweCents,
    /** Saldo final hoje, sem receber o que te devem e sem pagar o que você deve. */
    inPocket,
    /** Saldo final depois que vocês se acertarem: é o próprio saldo final. */
    settled: final,
    hasGap: i.owedToMeCents > 0 || i.iOweCents > 0,
  };
}
