import "server-only";
import { asc, eq, gte, inArray, isNotNull } from "drizzle-orm";
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
  splits: { participantId: string; amountCents: number }[];
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
  // Divisão de cada compra: é o que diz quanto de cada fatura é de cada pessoa.
  const ids = rows.map((r) => r.id);
  const splits: { transactionId: string; participantId: string; amountCents: number }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    splits.push(...(await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, ids.slice(i, i + 500)))));
  }
  const by = new Map<string, CardTx["splits"]>();
  for (const x of splits) by.set(x.transactionId, [...(by.get(x.transactionId) ?? []), { participantId: x.participantId, amountCents: x.amountCents }]);
  return { cards, rows: rows.map((r) => ({ ...r, splits: by.get(r.id) ?? [] })) as CardTx[] };
}

/** Quanto de cada fatura é de cada pessoa (pela divisão das compras; estornos abatem). */
function sharesByInvoice(rows: CardTx[], closingDay: number) {
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

const sharesList = (m: Map<string, number> | undefined) =>
  [...(m ?? new Map<string, number>())].filter(([, v]) => v !== 0).map(([participantId, cents]) => ({ participantId, cents })).sort((a, b) => b.cents - a.cents);

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
      const shares = sharesByInvoice(mine, card.closingDay);
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
        shares: sharesList(shares.get(key)),
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
        openShares: sharesList(shares.get(s.open)),
        dueShares: sharesList(shares.get(s.dueInvoice)),
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
      const mine = rows.filter((r) => r.cardId === card.id);
      const totals = totalsByInvoice(mine, card.closingDay);
      const shares = sharesByInvoice(mine, card.closingDay);
      const me = viewer.participantId;
      return cardAlerts(card, today, (k) => totals.get(k) ?? 0, me ? (k) => shares.get(k)?.get(me) ?? 0 : undefined);
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
