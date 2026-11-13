import "server-only";
import { and, asc, count, eq, inArray, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { deleteReturning } from "@/db/ops";

type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Sai de uma família (ao entrar em outra ou ao apagar a conta):
 * - a pessoa dele lá continua (com os lançamentos e dívidas), mas vira "sem login";
 * - se ele administrava e não sobra nenhum administrador, o cargo passa para quem entrou primeiro;
 * - se a família fica sem ninguém e sem nenhum lançamento, ela é apagada (com `wipeIfEmpty`, mesmo com lançamentos).
 */
export async function leaveHousehold(tx: Tx, userId: string, householdId: string, { wipeIfEmpty = false } = {}) {
  const m = schema.memberships;
  const [mine] = await tx.select().from(m).where(and(eq(m.userId, userId), eq(m.householdId, householdId))).limit(1);
  if (!mine) return;
  await tx.delete(m).where(and(eq(m.userId, userId), eq(m.householdId, householdId)));
  const [u] = await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
  await releaseContacts(tx, userId, householdId, u?.name ?? "alguém");
  await tx.insert(schema.familyLog).values({
    householdId,
    actorUserId: userId,
    actorName: u?.name ?? "Alguém",
    subjectUserId: userId,
    action: "left",
    text: `${u?.name ?? "Alguém"} saiu do casal (continua nos lançamentos, sem login).`,
  });
  const rest = await tx.select({ userId: m.userId, role: m.role }).from(m).where(eq(m.householdId, householdId)).orderBy(asc(m.createdAt));
  if (mine.role === "owner" && rest.length > 0 && !rest.some((r) => r.role === "owner")) {
    await tx.update(m).set({ role: "owner" }).where(and(eq(m.userId, rest[0].userId), eq(m.householdId, householdId)));
    const [heir] = await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, rest[0].userId));
    await tx.insert(schema.familyLog).values({
      householdId,
      actorUserId: null,
      actorName: "Birion",
      subjectUserId: rest[0].userId,
      action: "role",
      text: `${heir?.name ?? "Alguém"} virou administrador (era quem estava há mais tempo).`,
    });
  }
  if (rest.length === 0) {
    const [{ n }] = await tx.select({ n: count() }).from(schema.transactions).where(eq(schema.transactions.householdId, householdId));
    if (n === 0 || wipeIfEmpty) await tx.delete(schema.households).where(eq(schema.households.id, householdId));
  }
}

/**
 * Contatos de quem sai da família (ou é removido): os que não aparecem em nada são apagados; os que
 * aparecem em lançamentos ficam sem dono e sem o nome real ("Contato de Fulano"), visíveis a todos.
 */
export async function releaseContacts(tx: Tx, userId: string, householdId: string, ownerName: string) {
  const P = schema.participants;
  const mine = and(eq(P.householdId, householdId), eq(P.ownerUserId, userId));
  await tx
    .delete(P)
    .where(
      and(
        mine,
        sql`not exists (select 1 from "memberships" m where m."participantId" = ${P.id})`,
        sql`not exists (select 1 from "transactions" x where x."payerId" = ${P.id})`,
        sql`not exists (select 1 from "transaction_splits" s where s."participantId" = ${P.id})`,
      ),
    );
  await tx
    .update(P)
    .set({ name: `Contato de ${ownerName.split(" ")[0]}`.slice(0, 60), photoData: null, photoUpdatedAt: null, ownerUserId: null })
    .where(mine);
}

/**
 * Apaga o que é só seu nesta família: lançamentos e contas que repetem que você criou e que não envolvem
 * nenhuma outra pessoa com login. O que envolve outra pessoa com login (ela aceitou, ou tem parte) fica,
 * para não mudar as contas dela. Depois, apaga seus contatos que não aparecem em mais nada.
 */
export async function deletePersonalData(tx: Tx, userId: string, householdId: string) {
  const t = schema.transactions;
  const others = tx
    .select({ id: schema.memberships.participantId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, householdId), ne(schema.memberships.userId, userId), isNotNull(schema.memberships.participantId)));
  const otherIds = (await others).map((x) => x.id as string);
  const involvesOthers =
    otherIds.length === 0
      ? sql`false`
      : or(
          inArray(t.payerId, otherIds),
          sql`exists (select 1 from "transaction_splits" s where s."transactionId" = ${t.id} and s."participantId" in ${otherIds})`,
        )!;
  const removed = await deleteReturning(tx, t, and(eq(t.householdId, householdId), eq(t.createdBy, userId), sql`not (${involvesOthers})`), { id: t.id });
  // Contas que repetem: só as que não têm mais ninguém com login.
  const R = schema.recurringSeries;
  const series = await tx
    .select({ id: R.id, payerId: R.payerId, splits: R.splits })
    .from(R)
    .where(and(eq(R.householdId, householdId), eq(R.createdBy, userId)));
  const solo = series
    .filter((r) => !otherIds.includes(r.payerId ?? "") && !((r.splits as { participantId: string }[]) ?? []).some((x) => otherIds.includes(x.participantId)))
    .map((r) => r.id);
  if (solo.length) await tx.delete(R).where(inArray(R.id, solo));
  // Importações que ficaram vazias.
  const B = schema.importBatches;
  await tx
    .delete(B)
    .where(
      and(
        eq(B.householdId, householdId),
        eq(B.createdBy, userId),
        sql`not exists (select 1 from "transactions" x where x."importBatchId" = ${B.id})`,
      ),
    );
  // Seus contatos que não aparecem em mais nada.
  const P = schema.participants;
  await tx
    .delete(P)
    .where(
      and(
        eq(P.householdId, householdId),
        eq(P.ownerUserId, userId),
        notInArray(P.id, tx.select({ id: schema.memberships.participantId }).from(schema.memberships).where(isNotNull(schema.memberships.participantId)) as never),
        sql`not exists (select 1 from "transactions" x where x."payerId" = ${P.id})`,
        sql`not exists (select 1 from "transaction_splits" s where s."participantId" = ${P.id})`,
      ),
    );
  return removed.length;
}
