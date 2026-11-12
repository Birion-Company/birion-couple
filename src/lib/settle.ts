import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";

type Conn = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0] | ReturnType<typeof getDb>;

/**
 * Depois de mudar o valor ou a divisão de lançamentos: uma parte marcada como paga só continua paga
 * se tudo o que a pessoa pagou por ela (o pagamento que quitou + os parciais) cobre o valor novo.
 * Se não cobre, a parte reabre e o pagamento que quitava passa a contar como parcial (falta a diferença).
 * Ex.: Mercado de R$ 100, Zé pagou os R$ 50 dele; o valor vira R$ 200 → Zé continua devendo R$ 50.
 */
export async function reopenUnderpaid(conn: Conn, transactionIds: string[]) {
  if (transactionIds.length === 0) return 0;
  const t = schema.transactions;
  const S = schema.transactionSplits;
  const paid = await conn
    .select()
    .from(S)
    .where(and(inArray(S.transactionId, transactionIds), isNotNull(S.paidById)));
  if (paid.length === 0) return 0;
  const origIds = [...new Set(paid.map((x) => x.transactionId))];
  const [origs, pays] = await Promise.all([
    conn.select({ id: t.id, kind: t.kind }).from(t).where(inArray(t.id, origIds)),
    conn.select({ id: t.id, settlesId: t.settlesId, payerId: t.payerId, amountCents: t.amountCents }).from(t).where(inArray(t.settlesId, origIds)),
  ]);
  const paySplits = pays.length ? await conn.select().from(S).where(inArray(S.transactionId, pays.map((p) => p.id))) : [];
  const kindOf = new Map(origs.map((o) => [o.id, o.kind]));
  // De quem é a parte que cada pagamento paga: quem pagou (despesa/dívida) ou quem recebe o repasse (receita).
  const partOf = (p: (typeof pays)[number]) =>
    kindOf.get(p.settlesId ?? "") === "income" ? paySplits.find((x) => x.transactionId === p.id)?.participantId : p.payerId;
  let reopened = 0;
  for (const sp of paid) {
    const total = pays
      .filter((p) => p.settlesId === sp.transactionId && partOf(p) === sp.participantId)
      .reduce((a, p) => a + p.amountCents, 0);
    if (total >= sp.amountCents) continue;
    await conn.update(S).set({ paidById: null }).where(and(eq(S.transactionId, sp.transactionId), eq(S.participantId, sp.participantId)));
    reopened++;
  }
  return reopened;
}
