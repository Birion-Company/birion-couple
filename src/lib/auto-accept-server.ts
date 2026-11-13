import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { approvalStates, saveDecision, type ApprovalInput } from "./approvals";
import { ruleApplies, type AutoRule } from "./auto-accept";
import { formatMoney } from "./money";
import { sendPush, usersOf } from "./push-server";

/**
 * Depois que alguém lançou algo, aceita sozinho o que bate com uma regra de aceite automático de quem
 * precisava aceitar. Fica registrado no histórico ("aceito pela regra") e os dois são avisados.
 * Devolve as pessoas que aceitaram por regra, para o aviso de "Nova dívida" não pedir o que já foi aceito.
 */
export async function applyAutoAccept(householdId: string, actorUserId: string, since: Date): Promise<Set<string>> {
  const accepted = new Set<string>();
  const db = getDb();
  const rules = (await db.select().from(schema.autoAcceptRules).where(eq(schema.autoAcceptRules.householdId, householdId))) as (AutoRule & { householdId: string })[];
  if (rules.length === 0) return accepted;
  const T = schema.transactions;
  const txs = await db.select().from(T).where(and(eq(T.householdId, householdId), eq(T.createdBy, actorUserId), gte(T.createdAt, since))).limit(400);
  if (txs.length === 0) return accepted;
  const splits = await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, txs.map((x) => x.id)));
  const rows: ApprovalInput[] = txs.map((x) => ({
    id: x.id,
    seriesId: x.seriesId,
    kind: x.kind,
    payerId: x.payerId,
    amountCents: x.amountCents,
    createdBy: x.createdBy,
    createdAt: x.createdAt,
    splits: splits.filter((s) => s.transactionId === x.id).map((s) => ({ participantId: s.participantId, amountCents: s.amountCents })),
  }));
  const states = await approvalStates(householdId, rows);
  if (states.size === 0) return accepted;
  const [house] = await db.select({ currency: schema.households.currency }).from(schema.households).where(eq(schema.households.id, householdId));
  const done = new Set<string>();
  for (const row of rows) {
    const st = states.get(row.id);
    if (!st) continue;
    const creatorId = st.creatorId;
    for (const pid of st.waiting) {
      const mine = rules.filter((r) => r.participantId === pid);
      const desc = txs.find((x) => x.id === row.id)!.description;
      if (!mine.some((r) => ruleApplies(r, { creatorId, description: desc, amountCents: row.amountCents, splits: row.splits }))) continue;
      // Uma série (parcelas, todo mês) é aceita uma vez só: a decisão vale para a série inteira.
      const dedupe = `${row.seriesId ?? row.id}:${pid}`;
      if (done.has(dedupe)) {
        accepted.add(pid);
        continue;
      }
      done.add(dedupe);
      await saveDecision(householdId, row, pid, "accepted", null);
      accepted.add(pid);
      const [acceptor] = await usersOf(householdId, [pid]);
      await db.insert(schema.activities).values({
        householdId,
        actorUserId: acceptor?.userId ?? actorUserId,
        action: "approval",
        transactionId: row.id,
        data: { decision: "accepted", auto: true, items: [{ d: desc, a: [creatorId ?? "", pid].filter(Boolean) }] },
        audience: [creatorId, pid].filter((x): x is string => !!x),
      });
      const money = formatMoney(row.amountCents, house?.currency ?? "BRL");
      await sendPush([actorUserId], { title: "Aceito pela regra", body: `“${desc}” (${money}) foi aceito automaticamente.`, url: `/transacoes/${row.id}` }).catch(() => {});
    }
  }
  return accepted;
}
