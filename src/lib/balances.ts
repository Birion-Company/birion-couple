/** loan = empréstimo (quem emprestou → quem deve); transfer = acerto (quem deve → quem recebe). */
export type TransactionKind = "expense" | "income" | "transfer" | "loan";

export type BalanceInput = {
  amountCents: number;
  kind: TransactionKind;
  payerId: string | null;
  /** Marcado como acertado no modelo antigo: fica fora das dívidas. */
  settled: boolean;
  /** Acerto ligado a uma dívida: quem paga já foi tirado da dívida pela própria parte (paidById). */
  settlesId?: string | null;
  /** paidById: parte já paga com um acerto, fica fora das dívidas. */
  splits: { participantId: string; amountCents: number; paidById?: string | null }[];
};

/** Lançamentos que não mexem em dívida nenhuma. */
const outOfDebts = (t: BalanceInput) => t.settled || !t.payerId || !!t.settlesId;

/**
 * Saldo de cada pessoa: positivo = tem a receber, negativo = deve.
 *
 * Entra tudo que tem quem pagou. Partes já pagas com um acerto ligado ficam de fora, e o próprio acerto
 * ligado também (se Fulano pagou R$ 30,00 por uma dívida de R$ 20,00, os R$ 10,00 a mais são lucro, não dívida).
 * - Despesa, empréstimo ou acerto: quem pagou adianta o valor; cada participante deve a sua parte.
 * - Receita: quem recebeu ficou com dinheiro que é de todos; deve a parte de cada um.
 */
export function computeBalances(rows: BalanceInput[]): Map<string, number> {
  const net = new Map<string, number>();
  const add = (id: string, v: number) => net.set(id, (net.get(id) ?? 0) + v);
  for (const t of rows) {
    if (outOfDebts(t)) continue;
    const sign = t.kind === "income" ? -1 : 1;
    for (const s of t.splits) {
      if (s.participantId === t.payerId || s.paidById) continue;
      add(t.payerId!, sign * s.amountCents);
      add(s.participantId, -sign * s.amountCents);
    }
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

/**
 * Visão de uma pessoa só: quanto cada outra pessoa deve a ela (positivo) ou ela deve (negativo),
 * olhando apenas os lançamentos entre as duas. Usado para membros que não administram a família,
 * que não veem os lançamentos dos outros e por isso não podem usar a compensação geral.
 */
export function pairwiseFor(me: string, rows: BalanceInput[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const t of rows) for (const [other, v] of pairEffects(me, t)) net.set(other, (net.get(other) ?? 0) + v);
  return net;
}

/**
 * Quanto um lançamento mexe na dívida entre `me` e cada outra pessoa:
 * positivo = a outra pessoa passa a dever para mim; negativo = eu passo a dever para ela.
 */
export function pairEffects(me: string, t: BalanceInput): Map<string, number> {
  const out = new Map<string, number>();
  if (outOfDebts(t)) return out;
  const add = (id: string, v: number) => out.set(id, (out.get(id) ?? 0) + v);
  const sign = t.kind === "income" ? -1 : 1;
  if (t.payerId === me) {
    for (const s of t.splits) if (s.participantId !== me && !s.paidById) add(s.participantId, sign * s.amountCents);
  } else {
    for (const s of t.splits) if (s.participantId === me && !s.paidById) add(t.payerId!, -sign * s.amountCents);
  }
  return out;
}

/** Converte a visão de uma pessoa em linhas "quem deve para quem". */
export function pairwiseSettlements(me: string, net: Map<string, number>): Settlement[] {
  return [...net]
    .filter(([, v]) => v !== 0)
    .map(([other, v]) => (v > 0 ? { fromId: other, toId: me, amountCents: v } : { fromId: me, toId: other, amountCents: -v }))
    .sort((a, b) => b.amountCents - a.amountCents);
}
