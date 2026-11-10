import "server-only";
import { asc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { cardsFor, txScope, type Viewer } from "./access";
import { ensureRecurring } from "./recurring-server";
import { addMonthsKey, cardAlerts, cardSchedule, invoiceDates, invoiceOf, invoiceRange, todayIn, type CardAlert } from "./cards";

const t = schema.transactions;

export type CardTx = {
  id: string;
  cardId: string | null;
  date: string;
  description: string;
  amountCents: number;
  kind: string;
  seriesId: string | null;
  seriesKind: string | null;
  seriesIndex: number | null;
  seriesTotal: number | null;
  invoicePaid: boolean;
  splits: { participantId: string; amountCents: number; paidById?: string | null }[];
};

/** Despesas somam na fatura; receitas no cartão (estornos) abatem; acertos não entram. */
const signed = (r: CardTx) => (r.kind === "expense" ? r.amountCents : r.kind === "income" ? -r.amountCents : 0);

/** Cartões da família e os lançamentos de cartão que esta pessoa pode ver. */
/** Uma vez por requisição para o mesmo período (o painel pede as mesmas faturas mais de uma vez). */
const loadCards = cache(async (viewer: Viewer, since: string) => {
  const householdId = viewer.householdId;
  await ensureRecurring(householdId);
  const db = getDb();
  const [cards, rows] = await Promise.all([
    db.select().from(schema.creditCards).where(eq(schema.creditCards.householdId, householdId)).orderBy(asc(schema.creditCards.createdAt)),
    db
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
      .where(txScope(viewer, isNotNull(t.cardId), gte(t.date, since)))
      .orderBy(asc(t.date)),
  ]);
  // Divisão de cada compra: é o que diz quanto de cada fatura é de cada pessoa.
  const ids = rows.map((r) => r.id);
  const splits: { transactionId: string; participantId: string; amountCents: number; paidById: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    splits.push(...(await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, ids.slice(i, i + 500)))));
  }
  const by = new Map<string, CardTx["splits"]>();
  for (const x of splits) by.set(x.transactionId, [...(by.get(x.transactionId) ?? []), { participantId: x.participantId, amountCents: x.amountCents, paidById: x.paidById }]);
  return { cards, rows: rows.map((r) => ({ ...r, splits: by.get(r.id) ?? [] })) as CardTx[] };
});

/** Quanto de cada fatura é de cada pessoa (pela divisão das compras; estornos abatem). */
export function sharesByInvoice(rows: CardTx[], closingDay: number) {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const sign = r.kind === "expense" ? 1 : r.kind === "income" ? -1 : 0;
    if (!sign) continue;
    const key = invoiceOf(r.date, closingDay);
    const m = out.get(key) ?? new Map<string, number>();
    for (const x of r.splits) m.set(x.participantId, (m.get(x.participantId) ?? 0) + sign * x.amountCents);
    out.set(key, m);
  }
  return out;
}

/** Quanto de cada fatura cada pessoa ainda deve (as partes que ela ainda não pagou a quem tem o cartão). */
export function owedByInvoice(rows: CardTx[], closingDay: number) {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.kind !== "expense") continue;
    const key = invoiceOf(r.date, closingDay);
    const m = out.get(key) ?? new Map<string, number>();
    for (const x of r.splits) if (!x.paidById) m.set(x.participantId, (m.get(x.participantId) ?? 0) + x.amountCents);
    out.set(key, m);
  }
  return out;
}

const sharesList = (m: Map<string, number> | undefined, owed?: Map<string, number>) =>
  [...(m ?? new Map<string, number>())]
    .filter(([, v]) => v !== 0)
    .map(([participantId, cents]) => ({ participantId, cents, owedCents: Math.max(0, Math.min(cents, owed?.get(participantId) ?? 0)) }))
    .sort((a, b) => b.cents - a.cents);

export function totalsByInvoice(rows: CardTx[], closingDay: number) {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const key = invoiceOf(r.date, closingDay);
    totals.set(key, (totals.get(key) ?? 0) + signed(r));
  }
  return totals;
}

/** Tudo o que a página Cartões mostra: situação de cada cartão, próximas faturas e parcelamentos em andamento. */
export async function getCardOverview(viewer: Viewer) {
  const today = todayIn();
  // Dois meses para trás bastam para a fatura fechada que ainda vai vencer.
  const since = `${addMonthsKey(today.slice(0, 7), -2)}-01`;
  const { cards: all, rows } = await loadCards(viewer, since);
  // Cada pessoa vê os próprios cartões; quem administra vê todos.
  const cards = cardsFor(viewer, all);

  return {
    today,
    cards: cards.map((card) => {
      const mine = rows.filter((r) => r.cardId === card.id);
      const totals = totalsByInvoice(mine, card.closingDay);
      const shares = sharesByInvoice(mine, card.closingDay);
      const owed = owedByInvoice(mine, card.closingDay);
      const s = cardSchedule(card, today);
      // Faturas: a que vai vencer (se já fechou), a aberta e as próximas com parcelas lançadas.
      const lastWithData = [...totals.keys()].sort().pop() ?? s.open;
      const keys: string[] = [];
      for (let k = s.dueInvoice; k <= lastWithData || k <= s.open; k = addMonthsKey(k, 1)) {
        keys.push(k);
        if (keys.length >= 13) break;
      }
      // Fatura paga: tem compras e todas foram marcadas como pagas.
      const paidOf = (key: string) => {
        const inv = mine.filter((r) => invoiceOf(r.date, card.closingDay) === key);
        return inv.length > 0 && inv.every((r) => r.invoicePaid);
      };
      const invoices = keys.map((key) => ({
        key,
        ...invoiceDates(key, card),
        ...invoiceRange(key, card.closingDay),
        totalCents: totals.get(key) ?? 0,
        shares: sharesList(shares.get(key), owed.get(key)),
        state: key < s.open ? ("closed" as const) : key === s.open ? ("open" as const) : ("future" as const),
        paid: paidOf(key),
      }));

      const series = new Map<string, { id: string; nextId: string; description: string; kind: string; total: number | null; next: number; remaining: number; amountCents: number; lastDate: string }>();
      for (const r of mine) {
        if (!r.seriesId || !r.seriesIndex) continue;
        if (invoiceOf(r.date, card.closingDay) < s.open) continue;
        const cur = series.get(r.seriesId);
        if (!cur) {
          series.set(r.seriesId, { id: r.seriesId, nextId: r.id, description: r.description, kind: r.seriesKind ?? "installment", total: r.seriesTotal, next: r.seriesIndex, remaining: 1, amountCents: r.amountCents, lastDate: r.date });
        } else {
          cur.remaining += 1;
          cur.lastDate = r.date;
        }
      }

      return {
        card,
        schedule: s,
        openTotal: totals.get(s.open) ?? 0,
        dueTotal: totals.get(s.dueInvoice) ?? 0,
        openShares: sharesList(shares.get(s.open), owed.get(s.open)),
        dueShares: sharesList(shares.get(s.dueInvoice), owed.get(s.dueInvoice)),
        invoices,
        series: [...series.values()],
      };
    }),
  };
}

/** Avisos de fechamento e vencimento próximos, para o popup. */
export async function getCardAlerts(viewer: Viewer): Promise<CardAlert[]> {
  const today = todayIn();
  const since = `${addMonthsKey(today.slice(0, 7), -2)}-01`;
  const { cards, rows } = await loadCards(viewer, since);
  // Aviso de fatura só para o dono do cartão.
  return cards
    .filter((c) => !c.archived && c.ownerId !== null && c.ownerId === viewer.participantId)
    .flatMap((card) => {
      // Fatura já paga não precisa de aviso de vencimento.
      const mine = rows.filter((r) => r.cardId === card.id && !r.invoicePaid);
      const totals = totalsByInvoice(mine, card.closingDay);
      const shares = sharesByInvoice(mine, card.closingDay);
      const me = viewer.participantId;
      return cardAlerts(card, today, (k) => totals.get(k) ?? 0, me ? (k) => shares.get(k)?.get(me) ?? 0 : undefined);
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export type DueInvoice = { cardId: string; cardName: string; color: string; key: string; due: string; totalCents: number; mineCents: number; paid: boolean };

/**
 * Faturas que vencem num mês ("2026-11" = fatura de novembro), de cada cartão da pessoa.
 * Só dos cartões da pessoa (`person`, ou de quem está vendo). Mostra quanto é dela e quanto é de outras pessoas.
 */
export async function getInvoicesDue(viewer: Viewer, month: string, person: string | null, everyone = false): Promise<DueInvoice[]> {
  // Desde 4 meses antes do mês atual (ou antes, para meses passados): o mesmo período para as
  // faturas do mês passado, deste e do escolhido, e a leitura do banco sai uma vez só.
  const from = addMonthsKey(month, -3) < addMonthsKey(todayIn().slice(0, 7), -4) ? addMonthsKey(month, -3) : addMonthsKey(todayIn().slice(0, 7), -4);
  const { cards, rows } = await loadCards(viewer, `${from}-01`);
  // "Todos": as faturas de todos os cartões que você vê; senão, só os da pessoa.
  const owner = everyone ? null : person ?? viewer.participantId;
  const out: DueInvoice[] = [];
  for (const card of cardsFor(viewer, cards)) {
    if (card.archived || (owner && card.ownerId !== owner) || (!owner && !everyone)) continue;
    const mine = rows.filter((r) => r.cardId === card.id);
    const totals = totalsByInvoice(mine, card.closingDay);
    const shares = sharesByInvoice(mine, card.closingDay);
    // A fatura do mês: a que vence nele (fecha no mês anterior ou no próprio mês).
    for (const key of [addMonthsKey(month, -1), month]) {
      const { due } = invoiceDates(key, card);
      if (due.slice(0, 7) !== month) continue;
      const total = totals.get(key) ?? 0;
      if (total === 0) continue;
      const inv = mine.filter((r) => invoiceOf(r.date, card.closingDay) === key);
      out.push({
        cardId: card.id,
        cardName: card.name,
        color: card.color,
        key,
        due,
        totalCents: total,
        mineCents: owner ? shares.get(key)?.get(owner) ?? 0 : total,
        paid: inv.length > 0 && inv.every((r) => r.invoicePaid),
      });
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : 1));
}

/**
 * Mês que o painel abre: o da fatura que ainda falta pagar. Se as faturas do mês (de todos os seus cartões)
 * já foram pagas, pula para o próximo; se há uma do mês passado em aberto, fica nela. Sem cartão, o mês atual.
 */
export async function defaultPanelMonth(viewer: Viewer): Promise<string> {
  const current = todayIn().slice(0, 7);
  const prev = addMonthsKey(current, -1);
  const [before, now] = await Promise.all([getInvoicesDue(viewer, prev, null), getInvoicesDue(viewer, current, null)]);
  if (before.some((v) => !v.paid && v.totalCents > 0)) return prev;
  if (now.length > 0 && now.every((v) => v.paid || v.totalCents <= 0)) return addMonthsKey(current, 1);
  return current;
}
