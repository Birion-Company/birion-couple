import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logActivity, snapshots } from "./activity";
import { todayIn } from "./cards";
import { formatMoney, splitEqually } from "./money";
import { sendPush } from "./push-server";
import { ruleCategory } from "./rules-server";
import type { PurchaseInput } from "./purchase";
import { insertReturning } from "@/db/ops";

export const SOURCE = "cartao-api";
const hash = (k: string) => createHash("sha256").update(k).digest("hex");

/** Cria (ou troca) a chave da pessoa. A chave inteira só existe neste retorno; no banco fica o hash. */
export async function createPurchaseKey(userId: string) {
  const key = `bf_${randomBytes(24).toString("base64url")}`;
  await getDb()
    .insert(schema.purchaseKeys)
    .values({ userId, keyHash: hash(key), prefix: key.slice(0, 7) })
    .onDuplicateKeyUpdate({ set: { keyHash: hash(key), prefix: key.slice(0, 7), lastUsedAt: null, createdAt: new Date() } });
  return key;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type PurchaseResult = { ok: true; id: string; duplicate: boolean; category: string | null; card: string } | { ok: false; status: number; error: string };

/**
 * "Compra recebida": cria a despesa no cartão da pessoa dona da chave, com a categoria das regras (ou do histórico do
 * estabelecimento) e a divisão que a família já usa nesse lugar. Quem precisa aceitar é avisado como em qualquer lançamento.
 */
export async function recordPurchase(key: string, input: PurchaseInput): Promise<PurchaseResult> {
  const db = getDb();
  const [found] = await db
    .select({ userId: schema.purchaseKeys.userId })
    .from(schema.purchaseKeys)
    .where(eq(schema.purchaseKeys.keyHash, hash(key)));
  if (!found) return { ok: false, status: 401, error: "Chave inválida." };
  const [m] = await db
    .select({ householdId: schema.memberships.householdId, participantId: schema.memberships.participantId, role: schema.memberships.role, userName: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.userId, found.userId))
    .limit(1);
  if (!m?.participantId) return { ok: false, status: 403, error: "Chave sem casal ligado." };
  const me = m.participantId;
  const userId = found.userId;
  const householdId = m.householdId;

  // Freio: no máximo 60 compras por minuto por chave.
  const T = schema.transactions;
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(T).where(and(eq(T.householdId, householdId), eq(T.createdBy, userId), eq(T.source, SOURCE), gte(T.createdAt, new Date(Date.now() - 60_000))));
  if (n >= 60) return { ok: false, status: 429, error: "Muitas compras em pouco tempo." };

  // O cartão: pelo nome (sem diferenciar maiúsculas/acentos) ou o único cartão da pessoa.
  const cards = (await db.select().from(schema.creditCards).where(and(eq(schema.creditCards.householdId, householdId), eq(schema.creditCards.ownerId, me), eq(schema.creditCards.archived, false)))) ?? [];
  const card = input.card ? cards.find((c) => fold(c.name) === fold(input.card!)) ?? cards.find((c) => fold(c.name).includes(fold(input.card!))) : cards.length === 1 ? cards[0] : undefined;
  if (!card) return { ok: false, status: 422, error: cards.length === 0 ? "Você ainda não tem cartão cadastrado." : input.card ? `Cartão "${input.card}" não encontrado.` : "Você tem mais de um cartão: informe card." };

  const externalId = input.externalId ? `api:${input.externalId}` : null;
  if (externalId) {
    const [dup] = await db.select({ id: T.id }).from(T).where(and(eq(T.householdId, householdId), eq(T.externalId, externalId)));
    if (dup) return { ok: true, id: dup.id, duplicate: true, category: null, card: card.name };
  }

  const categoryId = await ruleCategory(householdId, "expense", input.description, null);
  // A compra entra só em "A identificar", dividida só com quem tem o cartão: ninguém mais é avisado nem vê até a pessoa confirmar
  // (ela pode querer atribuir a outra pessoa).
  const people = [me];
  const parts = splitEqually(input.amountCents, people.length);

  const id = await db.transaction(async (tx) => {
    const [row] = await insertReturning(tx, T, { householdId, date: input.date ?? todayIn(), description: input.description, amountCents: input.amountCents, kind: "expense", payerId: me, categoryId, cardId: card.id, source: SOURCE, externalId, needsReview: true, createdBy: userId }, { id: T.id });
    await tx.insert(schema.transactionSplits).values(people.map((pid, i) => ({ transactionId: row.id, participantId: pid, amountCents: parts[i] })));
    const snap = (await snapshots(tx, householdId, [row.id])).get(row.id)!;
    await logActivity(tx, { userId, householdId, role: m.role === "owner" ? "owner" : "member", participantId: me } as never, { action: "created", transactionId: row.id, data: { tx: snap }, audience: [me] });
    return row.id;
  });

  const [cat] = categoryId ? await db.select({ name: schema.categories.name }).from(schema.categories).where(eq(schema.categories.id, categoryId)) : [];
  const [house] = await db.select({ currency: schema.households.currency }).from(schema.households).where(eq(schema.households.id, householdId));
  await db.update(schema.purchaseKeys).set({ lastUsedAt: new Date() }).where(eq(schema.purchaseKeys.userId, userId));
  await sendPush([userId], {
    title: "Compra no cartão",
    body: `${input.description}: ${formatMoney(input.amountCents, house?.currency ?? "BRL")} no ${card.name}${cat ? ` · ${cat.name}` : " · sem categoria"}. Confirme em A identificar.`,
    url: "/identificar",
  }).catch(() => {});
  return { ok: true, id, duplicate: false, category: cat?.name ?? null, card: card.name };
}
