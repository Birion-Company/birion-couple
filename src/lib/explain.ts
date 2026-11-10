import { formatMoney } from "./money";

/**
 * Frase didática que vai embaixo de cada lançamento, por exemplo:
 * "Você comprou no cartão A · falta você receber de: Fulano (R$ 20,00)".
 * Quem já pagou a própria parte não aparece aqui: vira um selo (ver TxExplain).
 */
export type ExplainInput = {
  kind: string;
  amountCents: number;
  payerId: string | null;
  splits: { participantId: string; amountCents: number; paidById?: string | null; paidCents?: number | null; partCents?: number; pendingPayId?: string | null }[];
  /** Receita que ainda não caiu na conta. */
  awaitingReceipt?: boolean;
  cardName: string | null;
  /** Marcado como acertado no modelo antigo. */
  settled: boolean;
  me: string | null;
  names: Record<string, string>;
  currency?: string;
};

export function explainTx(i: ExplainInput): string {
  const money = (c: number) => formatMoney(c, i.currency ?? "BRL");
  const who = (id: string | null | undefined) => (!id ? "alguém" : id === i.me ? "você" : i.names[id] ?? "alguém");
  const list = (xs: { participantId: string; amountCents: number }[]) => xs.map((x) => `${who(x.participantId)} (${money(x.amountCents)})`).join(", ");
  const card = i.cardName ? ` · no cartão ${i.cardName}` : "";
  const done = i.settled ? " · já acertado" : "";
  const others = i.splits.filter((s) => s.participantId !== i.payerId && s.amountCents > 0);
  const open = i.settled ? [] : others.filter((s) => !s.paidById);

  if (i.kind === "loan") {
    const to = i.splits[0]?.participantId;
    return `Emprestado por ${who(i.payerId)} · ${open.length ? `${who(to)} deve devolver ${money(i.amountCents)}` : `${who(to)} já devolveu`}${done}`;
  }
  if (i.kind === "transfer") {
    const to = i.splits[0]?.participantId;
    return `${cap(who(i.payerId))} pagou ${money(i.amountCents)} para ${who(to)} (acerto)`;
  }
  if (i.kind === "income") {
    const head = i.payerId ? `Recebido por ${who(i.payerId)}` : "Falta dizer quem recebeu";
    if (!i.payerId) return `${head}${card}`;
    if (others.length === 0) return `${head}${card} · é só de ${who(i.payerId)}`;
    return `${head}${card}${open.length ? ` · deve repassar para ${list(open)}` : ""}${done}`;
  }
  // Despesa
  if (!i.payerId) {
    const owers = i.splits.filter((s) => s.amountCents > 0);
    return `Falta dizer quem pagou${card}${owers.length ? ` · de quem é: ${list(owers)}` : ""}`;
  }
  // No cartão quem pagou é o dono: "você comprou no cartão A".
  const head = i.cardName ? `${cap(who(i.payerId))} comprou no cartão ${i.cardName}` : `Pago por ${who(i.payerId)}`;
  if (others.length === 0) return `${head} · só de ${who(i.payerId)}, ninguém precisa reembolsar`;
  return `${head}${open.length ? ` · falta ${who(i.payerId)} receber de: ${list(open)}` : ""}${done}`;
}

/** Quem era para pagar cada parte, para mostrar em selos: pagou, deve, esperando confirmar. */
export type WhoPays = { participantId: string; cents: number; state: "own" | "open" | "paid" | "pending"; paidCents?: number | null; partCents?: number };

/**
 * A linha embaixo do lançamento em duas partes: o começo ("Você comprou no cartão Nubank") e um selo
 * por pessoa que tinha que pagar, todos no mesmo formato ("Você pagou R$ 45,00", "Fulano deve R$ 45,00").
 */
export function explainParts(i: ExplainInput): { head: string; who: WhoPays[] } {
  const w = (id: string | null | undefined) => (!id ? "alguém" : id === i.me ? "você" : i.names[id] ?? "alguém");
  // Acerto: quem pagou, no mesmo selo ("Fulano pagou R$ 45,00"), e para quem.
  if (i.kind === "transfer") {
    const to = i.splits[0]?.participantId;
    if (!i.payerId) return { head: explainTx(i), who: [] };
    return { head: `Acerto para ${w(to)}`, who: [{ participantId: i.payerId, cents: i.amountCents, state: "paid" }] };
  }
  const parts = i.splits.filter((s) => s.amountCents > 0);
  const who: WhoPays[] = parts.map((s) => ({
    participantId: s.participantId,
    cents: s.amountCents,
    state: s.participantId === i.payerId ? "own" : i.settled || s.paidById ? "paid" : s.pendingPayId && !s.partCents ? "pending" : "open",
    paidCents: s.paidCents ?? null,
    partCents: s.partCents ?? 0,
  }));
  // Dono primeiro (quem pagou), depois os outros.
  who.sort((a, b) => (a.state === "own" ? -1 : b.state === "own" ? 1 : 0));
  let head: string;
  if (i.kind === "loan") head = `Emprestado por ${w(i.payerId)}`;
  else if (i.kind === "income") head = !i.payerId ? "Falta dizer quem recebeu" : i.awaitingReceipt ? `${cap(w(i.payerId))} ainda vai receber` : `Recebido por ${w(i.payerId)}`;
  else if (!i.payerId) head = "Falta dizer quem pagou";
  else head = i.cardName ? `${cap(w(i.payerId))} comprou no cartão ${i.cardName}` : `Pago por ${w(i.payerId)}`;
  return { head, who: i.payerId ? who : who.map((x) => ({ ...x, state: "open" as const })) };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * O que falta para um lançamento estar identificado (vai para "A identificar").
 * Não tem a ver com o status "Pendente", que é de pagamento.
 */
export function missingInfo(i: { kind: string; categoryId: string | null; payerId: string | null; splits: { participantId: string }[] }): string[] {
  if (i.kind !== "expense" && i.kind !== "income") return [];
  const out: string[] = [];
  // Receita não tem categoria.
  if (!i.categoryId && i.kind === "expense") out.push("categoria");
  if (!i.payerId) out.push(i.kind === "income" ? "quem recebeu" : "quem pagou");
  if (i.splits.length === 0) out.push(i.kind === "income" ? "de quem é" : "quem deveria pagar");
  return out;
}
