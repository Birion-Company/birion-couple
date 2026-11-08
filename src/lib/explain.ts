import { formatMoney } from "./money";

/**
 * Frase didática que vai embaixo de cada lançamento, por exemplo:
 * "Pago por Felipe · no cartão Nubank · quem deve reembolsar: Clara (R$ 45,00)".
 */
export type ExplainInput = {
  kind: string;
  amountCents: number;
  payerId: string | null;
  splits: { participantId: string; amountCents: number }[];
  cardName: string | null;
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

  if (i.kind === "loan") {
    const to = i.splits[0]?.participantId;
    return `Emprestado por ${who(i.payerId)} · ${who(to)} deve devolver ${money(i.amountCents)}${done}`;
  }
  if (i.kind === "transfer") {
    const to = i.splits[0]?.participantId;
    return `${cap(who(i.payerId))} pagou ${money(i.amountCents)} para ${who(to)} (acerto)`;
  }
  if (i.kind === "income") {
    const head = i.payerId ? `Recebido por ${who(i.payerId)}` : "Ninguém recebeu ainda";
    if (!i.payerId) return `${head}${card}`;
    return others.length ? `${head}${card} · deve repassar para ${list(others)}${done}` : `${head}${card} · é só de ${who(i.payerId)}`;
  }
  // Despesa
  if (!i.payerId) {
    const owers = i.splits.filter((s) => s.amountCents > 0);
    return `Ninguém pagou ainda${card}${owers.length ? ` · quem deve pagar: ${list(owers)}` : ""}`;
  }
  const head = `Pago por ${who(i.payerId)}${card}`;
  if (others.length === 0) return `${head} · só de ${who(i.payerId)}, ninguém precisa reembolsar`;
  return `${head} · quem deve reembolsar: ${list(others)}${done}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
