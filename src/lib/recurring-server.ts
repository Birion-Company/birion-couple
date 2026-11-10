import "server-only";
import { and, eq, inArray, max } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { todayIn } from "./cards";
import { classifyFromHistory, expandInstallments } from "./patterns-server";
import { hideIdleContacts } from "./contacts";
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
            // Receita que se repete (ex.: salário): cada mês começa "a receber" até a pessoa confirmar.
            awaitingReceipt: s.kind === "income",
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

/** Última manutenção de cada família neste servidor: quando, em que mês e a última atividade que já tinha visto. */
const lastRun = new Map<string, { at: number; month: string; activity: number }>();
/** Mesmo sem mudanças, refaz de tempos em tempos (ex.: o mês virou, outra instância do servidor gravou algo). */
const FRESH_MS = 5 * 60_000;

/**
 * Manutenção da família: cria os meses das recorrências, as parcelas que faltam das compras
 * parceladas do extrato, classifica o que ficou sem categoria pelo histórico do estabelecimento
 * e esconde contatos parados e quites.
 *
 * Roda antes das consultas, mas só quando algo mudou: toda ação que grava registra uma atividade,
 * então basta ver se há atividade nova desde a última vez (uma consulta de ~1 ms). Assim trocar de
 * página não espera essas quatro rotinas à toa.
 */
export const ensureRecurring = cache(async (householdId: string) => {
  const month = todayIn().slice(0, 7);
  const [row] = await getDb()
    .select({ at: max(schema.activities.createdAt) })
    .from(schema.activities)
    .where(eq(schema.activities.householdId, householdId));
  const activity = row?.at?.getTime() ?? 0;
  const prev = lastRun.get(householdId);
  if (prev && prev.month === month && prev.activity === activity && Date.now() - prev.at < FRESH_MS) return;
  await materializeRecurring(householdId);
  await expandInstallments(householdId);
  await classifyFromHistory(householdId);
  await hideIdleContacts(householdId);
  lastRun.set(householdId, { at: Date.now(), month, activity });
});
