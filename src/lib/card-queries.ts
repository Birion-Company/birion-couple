import "server-only";
import { asc, eq, gte, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { txScope, type Viewer } from "./access";
import { ensureRecurring } from "./recurring-server";
import { addMonthsKey, cardAlerts, cardSchedule, invoiceDates, invoiceOf, invoiceRange, todayIn, type CardAlert } from "./cards";

const t = schema.transactions;

type CardTx = {
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
};

/** Despesas somam na fatura; receitas no cartão (estornos) abatem; acertos não entram. */
const signed = (r: CardTx) => (r.kind === "expense" ? r.amountCents : r.kind === "income" ? -r.amountCents : 0);

/** Cartões da família e os lançamentos de cartão que esta pessoa pode ver. */
async function loadCards(viewer: Viewer, since: string) {
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
      })
      .from(t)
      .where(txScope(viewer, isNotNull(t.cardId), gte(t.date, since)))
      .orderBy(asc(t.date)),
  ]);
  return { cards, rows: rows as CardTx[] };
}

function totalsByInvoice(rows: CardTx[], closingDay: number) {
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
  const { cards, rows } = await loadCards(viewer, since);

  return {
    today,
    cards: cards.map((card) => {
      const mine = rows.filter((r) => r.cardId === card.id);
      const totals = totalsByInvoice(mine, card.closingDay);
      const s = cardSchedule(card, today);
      // Faturas: a que vai vencer (se já fechou), a aberta e as próximas com parcelas lançadas.
      const lastWithData = [...totals.keys()].sort().pop() ?? s.open;
      const keys: string[] = [];
      for (let k = s.dueInvoice; k <= lastWithData || k <= s.open; k = addMonthsKey(k, 1)) {
        keys.push(k);
        if (keys.length >= 13) break;
      }
      const invoices = keys.map((key) => ({
        key,
        ...invoiceDates(key, card),
        ...invoiceRange(key, card.closingDay),
        totalCents: totals.get(key) ?? 0,
        state: key < s.open ? ("closed" as const) : key === s.open ? ("open" as const) : ("future" as const),
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
  return cards
    .filter((c) => !c.archived)
    .flatMap((card) => {
      const totals = totalsByInvoice(
        rows.filter((r) => r.cardId === card.id),
        card.closingDay,
      );
      return cardAlerts(card, today, (k) => totals.get(k) ?? 0);
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
