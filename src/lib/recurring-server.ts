import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { todayIn } from "./cards";
import { dueOccurrences, endOfMonth } from "./recurring";

type Split = { participantId: string; amountCents: number };

/**
 * Cria os lançamentos que faltam das recorrências sem fim da família, até o fim do mês corrente.
 * Roda no começo das consultas do painel, da lista e dos cartões; é seguro chamar várias vezes
 * (a linha da recorrência fica travada enquanto gera, e o próximo número só avança junto).
 */
export async function materializeRecurring(householdId: string) {
  const db = getDb();
  const horizon = endOfMonth(todayIn());
  const series = await db
    .select({ id: schema.recurringSeries.id, startDate: schema.recurringSeries.startDate, nextIndex: schema.recurringSeries.nextIndex })
    .from(schema.recurringSeries)
    .where(and(eq(schema.recurringSeries.householdId, householdId), eq(schema.recurringSeries.active, true)));
  const pending = series.filter((s) => dueOccurrences(s.startDate, s.nextIndex, horizon, 1).length > 0);
  for (const { id } of pending) {
    await db.transaction(async (tx) => {
      const [s] = await tx.select().from(schema.recurringSeries).where(eq(schema.recurringSeries.id, id)).for("update");
      if (!s || !s.active) return;
      const due = dueOccurrences(s.startDate, s.nextIndex, horizon);
      if (due.length === 0) return;
      // Só pessoas que ainda existem na família.
      const wanted = (s.splits as Split[]).filter((x) => x.amountCents > 0);
      const alive = wanted.length
        ? await tx
            .select({ id: schema.participants.id })
            .from(schema.participants)
            .where(and(eq(schema.participants.householdId, householdId), inArray(schema.participants.id, wanted.map((x) => x.participantId))))
        : [];
      const ids = new Set(alive.map((a) => a.id));
      const splits = wanted.filter((x) => ids.has(x.participantId));
      if (splits.length === 0) {
        await tx.update(schema.recurringSeries).set({ active: false }).where(eq(schema.recurringSeries.id, id));
        return;
      }
      const amount = splits.reduce((a, x) => a + x.amountCents, 0);
      const rows = await tx
        .insert(schema.transactions)
        .values(
          due.map((d) => ({
            householdId,
            date: d.date,
            description: s.description,
            amountCents: amount,
            kind: s.kind,
            payerId: s.payerId,
            categoryId: s.categoryId,
            projectId: s.projectId,
            statusId: s.statusId,
            cardId: s.cardId,
            notes: s.notes,
            source: "manual",
            createdBy: s.createdBy,
            seriesId: s.id,
            seriesKind: "monthly",
            seriesIndex: d.index,
            seriesTotal: null,
          })),
        )
        .returning({ id: schema.transactions.id });
      await tx.insert(schema.transactionSplits).values(rows.flatMap((r) => splits.map((x) => ({ ...x, transactionId: r.id }))));
      await tx
        .update(schema.recurringSeries)
        .set({ nextIndex: due[due.length - 1].index + 1 })
        .where(eq(schema.recurringSeries.id, id));
    });
  }
}

/** Uma vez por requisição. */
export const ensureRecurring = cache(materializeRecurring);
