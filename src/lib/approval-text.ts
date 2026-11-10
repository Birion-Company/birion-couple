import { formatMoney } from "./money";

type Tx = { kind: string; amountCents: number; payerId: string | null; splits: { participantId: string; amountCents: number }[] };

/** O que um lançamento impõe a uma pessoa, em uma frase: "Você deve R$ 45,00 para Fulano". */
export function roleSentence(tx: Tx, me: string, name: (id: string | null) => string, currency: string) {
  const money = (c: number) => formatMoney(c, currency);
  const share = tx.splits.find((s) => s.participantId === me)?.amountCents ?? 0;
  const to = tx.splits[0]?.participantId ?? null;
  switch (tx.kind) {
    case "loan":
      return to === me ? `Você deve ${money(tx.amountCents)} para ${name(tx.payerId)}` : `${name(to)} te deve ${money(tx.amountCents)}`;
    case "transfer":
      return tx.payerId === me ? `Você pagou ${money(tx.amountCents)} para ${name(to)}` : `${name(tx.payerId)} te pagou ${money(tx.amountCents)}`;
    case "income":
      return tx.payerId === me ? `Você recebeu ${money(tx.amountCents)}` : `${name(tx.payerId)} te repassa ${money(share)}`;
    default: {
      if (tx.payerId === me) {
        const others = tx.splits.filter((s) => s.participantId !== me && s.amountCents > 0);
        return `Você pagou ${money(tx.amountCents)}${others.length ? `; ${others.map((o) => name(o.participantId)).join(", ")} te devem a parte` : ""}`;
      }
      return `Você deve ${money(share)} para ${name(tx.payerId)}`;
    }
  }
}
