import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type AccountBalance = { id: string; name: string; openingCents: number; inCents: number; outCents: number; balanceCents: number; updatedAt: Date };

/**
 * Saldo de cada conta: o saldo com que ela começou + as receitas que entraram nela (já recebidas) − as despesas
 * pagas por ela. Ninguém digita o saldo: ele vem dos lançamentos.
 */
export async function accountBalances(userId: string): Promise<AccountBalance[]> {
  const a = schema.accounts;
  const t = schema.transactions;
  const rows = await getDb()
    .select({
      id: a.id,
      name: a.name,
      opening: a.balanceCents,
      updatedAt: a.updatedAt,
      inCents: sql<number>`coalesce(sum(${t.amountCents}) filter (where ${t.kind} = 'income' and ${t.awaitingReceipt} = false), 0)::bigint`,
      outCents: sql<number>`coalesce(sum(${t.amountCents}) filter (where ${t.kind} = 'expense'), 0)::bigint`,
    })
    .from(a)
    .leftJoin(t, eq(t.accountId, a.id))
    .where(eq(a.userId, userId))
    .groupBy(a.id)
    .orderBy(asc(a.createdAt));
  return rows.map((r) => {
    const inCents = Number(r.inCents);
    const outCents = Number(r.outCents);
    return { id: r.id, name: r.name, openingCents: r.opening, inCents, outCents, balanceCents: r.opening + inCents - outCents, updatedAt: r.updatedAt };
  });
}
