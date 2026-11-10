/**
 * Status do lançamento, calculado sozinho a partir do que foi preenchido. Ninguém escolhe.
 *
 * - on-card    Compra no cartão cuja fatura ainda não foi paga. Vira "Pago" quando a fatura é marcada como paga.
 * - to-pay     Falta dizer quem pagou (só acontece em extrato importado sem isso). Vai para "A identificar".
 * - to-settle  Fora do cartão: alguém pagou e outra pessoa ainda deve a parte dela. Entra em Dívidas.
 * - paid       Pago: era só de quem pagou, todas as dívidas foram pagas (com acerto) ou a fatura foi paga.
 *
 * Compra no cartão segue a fatura: quem tem parte nela continua devendo em Dívidas até pagar.
 * Gastos, entradas, categorias e faturas contam todo lançamento, qualquer que seja o status.
 */
export type TxState = "to-pay" | "on-card" | "to-settle" | "paid";

export type TxStateInput = {
  kind: string;
  payerId: string | null;
  cardId?: string | null;
  invoicePaid?: boolean;
  /** Marcado como acertado no modelo antigo (antes dos acertos com valor): conta como pago. */
  settled: boolean;
  splits: { participantId: string; amountCents: number; paidById?: string | null }[];
};

/** Partes que ainda devem (fora quem pagou e quem já pagou com um acerto). */
export function owing<S extends { participantId: string; amountCents: number; paidById?: string | null }>(t: { payerId: string | null; splits: S[] }): S[] {
  return t.splits.filter((s) => s.participantId !== t.payerId && s.amountCents > 0 && !s.paidById);
}

export function txState(t: TxStateInput): TxState {
  if (t.kind === "transfer") return "paid";
  if (t.cardId && t.kind !== "loan") return t.invoicePaid ? "paid" : "on-card";
  if (!t.payerId) return "to-pay";
  if (t.settled) return "paid";
  return owing(t).length ? "to-settle" : "paid";
}

/** Valor do filtro na URL (?status=…) para cada status. */
export const STATE_PARAM: Record<TxState, string> = {
  "to-pay": "a-pagar",
  "on-card": "na-fatura",
  "to-settle": "a-acertar",
  paid: "pago",
};

export const STATE_INFO: Record<TxState, { label: string; color: string; help: string }> = {
  "to-pay": { label: "Falta quem pagou", color: "#E0A526", help: "Falta dizer quem pagou. Complete em A identificar." },
  "on-card": { label: "Na fatura", color: "#8B7CF6", help: "Cartão com a fatura em aberto." },
  "to-settle": { label: "A acertar", color: "#1AC4DB", help: "Alguém ainda deve a parte dele." },
  paid: { label: "Pago", color: "#3BAA7F", help: "Ninguém deve mais nada." },
};

/** Nome do status, ajustado ao tipo (receita "a receber", acerto entre pessoas…). */
export function stateLabel(state: TxState, kind: string): string {
  if (kind === "transfer") return "Acerto";
  if (kind === "income") {
    if (state === "to-pay") return "Falta quem recebeu";
    if (state === "to-settle") return "A repassar";
    if (state === "paid") return "Recebido";
  }
  return STATE_INFO[state].label;
}

/** No filtro só entram os status do dia a dia ("falta quem pagou" fica em A identificar). */
export const STATE_FILTER_OPTIONS = (["on-card", "to-settle", "paid"] as TxState[]).map((s) => ({
  id: STATE_PARAM[s],
  name: STATE_INFO[s].label,
  color: STATE_INFO[s].color,
}));

export function stateFromParam(v: string | null | undefined): TxState | null {
  const hit = (Object.entries(STATE_PARAM) as [TxState, string][]).find(([, p]) => p === v);
  return hit ? hit[0] : null;
}

/**
 * Lucro (positivo) ou desconto (negativo) de um acerto que pagou uma dívida:
 * Fulano devia R$ 20,00 e pagou R$ 30,00 → +R$ 10,00 de lucro.
 */
export function settleDiff(paidCents: number, owedCents: number) {
  return paidCents - owedCents;
}
