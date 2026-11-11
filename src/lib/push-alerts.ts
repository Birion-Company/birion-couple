import "server-only";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sharesByInvoice, totalsByInvoice, type CardTx } from "./card-queries";
import { addMonthsKey, cardAlerts, shortDate, todayIn } from "./cards";
import { formatMoney } from "./money";
import { wants } from "./push-prefs";
import { pushEnabled, sendPushOnce } from "./push-server";

/**
 * Avisos agendados por push: fatura perto de fechar e perto de vencer, para o dono de cada cartão,
 * dentro da antecedência escolhida no cartão. Cada aviso vai uma vez só (push_sent).
 * Roda uma vez por dia no Netlify (função agendada) e de hora em hora no servidor local.
 */
export async function runCardAlertPushes(): Promise<number> {
  if (!pushEnabled) return 0;
  const db = getDb();
  const today = todayIn();
  const cards = await db
    .select()
    .from(schema.creditCards)
    .where(and(eq(schema.creditCards.archived, false), isNotNull(schema.creditCards.ownerId), isNotNull(schema.creditCards.alertDays)));
  if (cards.length === 0) return 0;
  // Quem tem login entre os donos dos cartões (só essas pessoas recebem push).
  const owners = await db
    .select({ userId: schema.memberships.userId, participantId: schema.memberships.participantId, householdId: schema.memberships.householdId })
    .from(schema.memberships)
    .where(inArray(schema.memberships.participantId, cards.map((c) => c.ownerId!)));
  const subscribed = new Set(
    (await db.selectDistinct({ userId: schema.pushSubscriptions.userId }).from(schema.pushSubscriptions)).map((s) => s.userId),
  );
  const prefsOf = new Map(
    (await db.select({ id: schema.users.id, prefs: schema.users.pushPrefs }).from(schema.users).where(inArray(schema.users.id, [...subscribed].length ? [...subscribed] : ["00000000-0000-0000-0000-000000000000"]))).map((u) => [u.id, u.prefs]),
  );
  const since = `${addMonthsKey(today.slice(0, 7), -2)}-01`;
  const t = schema.transactions;
  const rows = await db
    .select({
      id: t.id,
      cardId: t.cardId,
      date: t.date,
      description: t.description,
      amountCents: t.amountCents,
      kind: t.kind,
      seriesId: t.seriesId,
      seriesKind: t.seriesKind,
      seriesIndex: t.seriesIndex,
      seriesTotal: t.seriesTotal,
      invoicePaid: t.invoicePaid,
    })
    .from(t)
    .where(and(inArray(t.cardId, cards.map((c) => c.id)), gte(t.date, since), eq(t.invoicePaid, false)));
  const splits = rows.length
    ? await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, rows.map((r) => r.id)))
    : [];
  const withSplits: CardTx[] = rows.map((r) => ({ ...r, splits: splits.filter((s) => s.transactionId === r.id) }));
  const [house] = await db.select({ currency: schema.households.currency }).from(schema.households).limit(1);
  let sent = 0;
  for (const card of cards) {
    const owner = owners.find((o) => o.participantId === card.ownerId && o.householdId === card.householdId);
    if (!owner || !subscribed.has(owner.userId)) continue;
    const mine = withSplits.filter((r) => r.cardId === card.id);
    const totals = totalsByInvoice(mine, card.closingDay);
    const shares = sharesByInvoice(mine, card.closingDay);
    const money = (c: number) => formatMoney(c, house?.currency ?? "BRL");
    for (const a of cardAlerts(card, today, (k) => totals.get(k) ?? 0, (k) => shares.get(k)?.get(card.ownerId!) ?? 0)) {
      if (!wants(prefsOf.get(owner.userId), a.type === "closing" ? "fatura-fecha" : "fatura-vence")) continue;
      const when = a.daysLeft === 0 ? "hoje" : a.daysLeft === 1 ? "amanhã" : `em ${a.daysLeft} dias`;
      const part = a.mineCents !== undefined && a.mineCents !== a.amountCents ? ` · sua parte ${money(a.mineCents)}` : "";
      const msg =
        a.type === "due" && a.daysLeft < 0
          ? { title: `Fatura do ${a.cardName} venceu e não foi paga`, body: `Venceu ${shortDate(a.date)}: ${money(a.amountCents)} em atraso${part}. Já pagou? Marque como paga em Cartões.` }
          : a.type === "closing"
          ? { title: `Fatura do ${a.cardName} fecha ${when}`, body: `Fecha ${shortDate(a.date)}, com ${money(a.amountCents)} até agora${part}.` }
          : { title: `Fatura do ${a.cardName} vence ${when}`, body: `Vence ${shortDate(a.date)}: ${money(a.amountCents)} para pagar${part}.` };
      if (await sendPushOnce(owner.userId, `cartao:${a.key}`, { ...msg, url: "/cartoes" })) sent++;
    }
  }
  return sent;
}
