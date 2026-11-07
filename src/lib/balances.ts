export type StatusBehavior = "pending" | "open" | "settled";
export type TransactionKind = "expense" | "income" | "transfer";

export type BalanceInput = {
  amountCents: number;
  kind: TransactionKind;
  payerId: string | null;
  behavior: StatusBehavior | null;
  splits: { participantId: string; amountCents: number }[];
};

/**
 * Saldo de cada pessoa: positivo = tem a receber, negativo = deve.
 *
 * Só entram transações com status de comportamento "open" (alguém pagou e ainda não foi acertado).
 * - Despesa ou acerto (transfer): quem pagou adianta o valor; cada participante deve a sua parte.
 * - Receita: quem recebeu ficou com dinheiro que é de todos; deve a parte de cada um.
 */
export function computeBalances(rows: BalanceInput[]): Map<string, number> {
  const net = new Map<string, number>();
  const add = (id: string, v: number) => net.set(id, (net.get(id) ?? 0) + v);
  for (const t of rows) {
    if (t.behavior !== "open" || !t.payerId) continue;
    const sign = t.kind === "income" ? -1 : 1;
    add(t.payerId, sign * t.amountCents);
    for (const s of t.splits) add(s.participantId, -sign * s.amountCents);
  }
  return net;
}

export type Settlement = { fromId: string; toId: string; amountCents: number };

/** Sugere o menor conjunto simples de pagamentos para zerar os saldos. */
export function suggestSettlements(net: Map<string, number>): Settlement[] {
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const out: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    if (pay > 0) out.push({ fromId: debtors[i].id, toId: creditors[j].id, amountCents: pay });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}
