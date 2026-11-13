import { parseAmountToCents } from "./money";

/** Corpo aceito pela rota "compra recebida". Aceita valor em número (45.9) ou texto ("45,90", "R$ 45,90"). */
export type PurchaseInput = { description: string; amountCents: number; date: string | null; card: string | null; externalId: string | null };

export function parsePurchase(body: unknown): { ok: true; value: PurchaseInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Envie um JSON com description e amount." };
  const b = body as Record<string, unknown>;
  const description = typeof b.description === "string" ? b.description.trim().slice(0, 200) : "";
  if (!description) return { ok: false, error: "description é obrigatório." };
  const raw = b.amount;
  if (typeof raw !== "number" && typeof raw !== "string") return { ok: false, error: "amount é obrigatório." };
  const cents = parseAmountToCents(typeof raw === "string" ? raw.replace(/^R\$\s*/i, "") : raw, typeof raw === "string" && /,/.test(raw) ? "," : undefined);
  if (cents === null) return { ok: false, error: "amount inválido." };
  const amountCents = Math.abs(cents);
  if (amountCents === 0 || amountCents > 1_000_000_00) return { ok: false, error: "amount deve ser maior que zero." };
  let date: string | null = null;
  if (b.date !== undefined && b.date !== null && b.date !== "") {
    if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || Number.isNaN(Date.parse(b.date))) return { ok: false, error: "date deve ser AAAA-MM-DD." };
    date = b.date;
  }
  const card = typeof b.card === "string" && b.card.trim() ? b.card.trim().slice(0, 60) : null;
  const externalId = typeof b.externalId === "string" && b.externalId.trim() ? b.externalId.trim().slice(0, 100) : null;
  return { ok: true, value: { description, amountCents, date, card, externalId } };
}
