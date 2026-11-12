"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { canManageCard, checkEditable } from "@/lib/access";
import { involved, logActivity, snapshots, type TxSnapshot } from "@/lib/activity";
import { requireAuth } from "@/lib/auth";
import { matchCategory } from "@/lib/import/dedupe";
import { reopenUnderpaid } from "@/lib/settle";
import { splitEqually } from "@/lib/money";
import { loadRules } from "@/lib/rules-server";
import type { ActionResult } from "./settings";

const uuid = z.uuid();
const nullableId = z.union([z.uuid(), z.null()]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida." });

/** Confere que cada id existe nesta família (pessoas, categorias, projetos, status, cartões). */
async function belongs(householdId: string, table: typeof schema.participants | typeof schema.categories | typeof schema.projects | typeof schema.statuses, ids: string[]) {
  if (ids.length === 0) return true;
  const found = await getDb()
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.householdId, householdId), inArray(table.id, ids)));
  return found.length === new Set(ids).size;
}

async function loadCard(householdId: string, id: string) {
  const [card] = await getDb()
    .select({ id: schema.creditCards.id, ownerId: schema.creditCards.ownerId })
    .from(schema.creditCards)
    .where(and(eq(schema.creditCards.id, id), eq(schema.creditCards.householdId, householdId)));
  return card ?? null;
}

// ---------- Editar vários de uma vez ----------

const PatchSchema = z.object({
  kind: z.enum(["expense", "income"]).optional(),
  settled: z.boolean().optional(),
  categoryId: nullableId.optional(),
  /** "Não precisa de categoria": tira a categoria e não volta para A identificar. */
  noCategory: z.boolean().optional(),
  projectId: nullableId.optional(),
  cardId: nullableId.optional(),
  payerId: nullableId.optional(),
  splitIds: z.array(uuid).min(1, { error: "Escolha pelo menos uma pessoa na divisão." }).max(10).optional(),
  date: isoDate.optional(),
});

export type BulkPatch = z.input<typeof PatchSchema>;

const FIELD_NAMES: Record<keyof BulkPatch, string> = {
  kind: "tipo",
  settled: "acertado",
  categoryId: "categoria",
  noCategory: "sem categoria",
  projectId: "projeto",
  cardId: "cartão",
  payerId: "quem pagou",
  splitIds: "quem deveria pagar",
  date: "data",
};

/**
 * Aplica as mesmas mudanças em vários lançamentos. Só mexe no que veio no `patch`.
 * O que não faz sentido para um lançamento é pulado (e contado na mensagem):
 * - quem pagou, divisão e cartão não mudam em empréstimos e acertos (mudariam quem tem a receber);
 * - o cartão precisa ser de quem pagou; se quem pagou mudar, um cartão de outra pessoa sai.
 */
export async function bulkEdit(ids: string[], patch: BulkPatch): Promise<ActionResult> {
  const auth = await requireAuth();
  const list = z.array(uuid).min(1, { error: "Nada selecionado." }).max(1000).safeParse(ids);
  if (!list.success) return { ok: false, error: list.error.issues[0].message };
  const parsed = PatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const p = parsed.data;
  const fields = (Object.keys(p) as (keyof BulkPatch)[]).filter((k) => p[k] !== undefined);
  if (fields.length === 0) return { ok: false, error: "Escolha pelo menos uma coisa para mudar." };

  const notAllowed = await checkEditable(auth, list.data);
  if (notAllowed) return { ok: false, error: notAllowed };
  const hid = auth.householdId;
  const people = [...(p.payerId ? [p.payerId] : []), ...(p.splitIds ?? [])];
  if (!(await belongs(hid, schema.participants, people))) return { ok: false, error: "Pessoa inválida." };
  if (p.categoryId && !(await belongs(hid, schema.categories, [p.categoryId]))) return { ok: false, error: "Categoria inválida." };
  if (p.projectId && !(await belongs(hid, schema.projects, [p.projectId]))) return { ok: false, error: "Projeto inválido." };
  const newCard = p.cardId ? await loadCard(hid, p.cardId) : null;
  if (p.cardId && !newCard) return { ok: false, error: "Cartão inválido." };
  if (newCard && !canManageCard(auth, newCard)) return { ok: false, error: "Você só pode usar os seus cartões." };

  const db = getDb();
  const before = await snapshots(db, hid, list.data);
  // Dono de cada cartão já usado nos lançamentos (para saber se continua valendo).
  const usedCards = [...new Set([...before.values()].map((s) => s.cardId).filter((c): c is string => !!c))];
  const ownerOf = new Map(
    usedCards.length
      ? (await db.select({ id: schema.creditCards.id, ownerId: schema.creditCards.ownerId }).from(schema.creditCards).where(inArray(schema.creditCards.id, usedCards))).map((c) => [c.id, c.ownerId])
      : [],
  );
  if (newCard) ownerOf.set(newCard.id, newCard.ownerId);

  const skipped = { card: 0, cardRemoved: 0 };
  // Empréstimos e acertos que ficaram de fora de quem pagou, divisão ou cartão (contados uma vez).
  const betweenSkipped = new Set<string>();
  const items: { d: string; a: string[] }[] = [];
  await db.transaction(async (tx) => {
    for (const [id, s] of before) {
      const between = s.kind === "loan" || s.kind === "transfer";
      const next: TxSnapshot = { ...s, splits: [...s.splits] };
      // Tipo: só entre despesa e receita (empréstimo e acerto ficam como estão).
      if (p.kind !== undefined) {
        if (between) betweenSkipped.add(id);
        else next.kind = p.kind;
      }
      if (p.settled !== undefined && s.kind !== "transfer") next.settled = p.settled;
      // Receita não tem categoria.
      if (p.categoryId !== undefined && !between && next.kind === "expense") next.categoryId = p.categoryId;
      // "Não precisa de categoria": fica sem categoria de propósito (escolher uma categoria desfaz).
      const noCategory = p.noCategory && !between && next.kind === "expense" ? true : p.categoryId ? false : undefined;
      if (noCategory) next.categoryId = null;
      if (next.kind === "income") next.categoryId = null;
      if (p.projectId !== undefined) next.projectId = p.projectId;
      if (p.date !== undefined) next.date = p.date;
      if (p.payerId !== undefined) {
        // Em empréstimo e acerto, trocar quem pagou muda quem tem a receber: só editando um por um.
        if (between) betweenSkipped.add(id);
        else next.payerId = p.payerId;
      }
      if (p.splitIds !== undefined) {
        if (between) betweenSkipped.add(id);
        else {
          const parts = splitEqually(s.amountCents, p.splitIds.length);
          next.splits = p.splitIds.map((participantId, i) => ({ participantId, amountCents: parts[i] })).filter((x) => x.amountCents > 0);
        }
      }
      if (p.cardId !== undefined) {
        if (between && p.cardId) betweenSkipped.add(id);
        else {
          next.cardId = next.kind === "income" ? null : p.cardId;
          // No cartão, quem pagou é sempre o dono dele.
          const owner = p.cardId ? ownerOf.get(p.cardId) : null;
          if (owner) next.payerId = owner;
        }
      }
      // Quem pagou mudou e o cartão é de outra pessoa: o cartão sai.
      // Receita não fica em cartão.
      if (next.kind === "income") next.cardId = null;
      if (next.cardId && ownerOf.get(next.cardId) && ownerOf.get(next.cardId) !== next.payerId) {
        next.cardId = null;
        skipped.cardRemoved++;
      }
      await tx
        .update(schema.transactions)
        .set({
          ...(next.cardId !== s.cardId ? { invoicePaid: false } : {}),
          kind: next.kind,
          settled: next.settled ?? false,
          categoryId: next.categoryId,
          ...(noCategory !== undefined ? { noCategory } : {}),
          projectId: next.projectId,
          date: next.date,
          payerId: next.payerId,
          cardId: next.cardId,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.transactions.id, id), eq(schema.transactions.householdId, hid)));
      if (p.splitIds !== undefined && !between) {
        // Quem já pagou a própria parte (com um acerto) continua quitado.
        const old = await tx.select().from(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, id));
        const paidBy = new Map(old.map((x) => [x.participantId, x.paidById]));
        await tx.delete(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, id));
        if (next.splits.length) await tx.insert(schema.transactionSplits).values(next.splits.map((x) => ({ ...x, paidById: paidBy.get(x.participantId) ?? null, transactionId: id })));
        await reopenUnderpaid(tx, [id]);
      }
      items.push({ d: s.description, a: involved(s, next) });
    }
    await logActivity(tx, auth, {
      action: "bulk",
      data: { items, fields: fields.map((f) => FIELD_NAMES[f]) },
      audience: items.flatMap((i) => i.a),
    });
  });
  revalidatePath("/", "layout");
  const notes = [
    betweenSkipped.size ? `${betweenSkipped.size} dívida(s)/acerto(s) não mudaram (edite um por um)` : null,
    skipped.card ? `${skipped.card} não receberam o cartão porque o cartão é de outra pessoa` : null,
    skipped.cardRemoved ? `${skipped.cardRemoved} saíram do cartão porque quem pagou mudou` : null,
  ].filter(Boolean);
  const n = before.size;
  return { ok: true, message: `${n} ${n === 1 ? "lançamento atualizado" : "lançamentos atualizados"}.${notes.length ? ` ${notes.join("; ")}.` : ""}` };
}

// ---------- Lançar vários de uma vez ----------

const ManySchema = z.object({
  kind: z.enum(["expense", "income"]),
  payerId: nullableId,
  splitIds: z.array(uuid).min(1, { error: "Escolha quem divide." }).max(10),
  cardId: nullableId,
  projectId: nullableId,
  rows: z
    .array(
      z.object({
        date: isoDate,
        description: z.string().trim().min(1, { error: "Toda linha precisa de descrição." }).max(200),
        amountCents: z.number().int().positive({ error: "Todo valor precisa ser maior que zero." }).max(1_000_000_000),
        categoryId: nullableId,
        /** "Não precisa de categoria" (não vai para A identificar e não usa as regras). */
        noCategory: z.boolean().optional(),
      }),
    )
    .min(1, { error: "Adicione pelo menos uma linha." })
    .max(100, { error: "No máximo 100 linhas por vez." }),
});

export type ManyInput = z.input<typeof ManySchema>;

/** Cria vários lançamentos com as mesmas configurações (quem pagou, divisão, cartão). */
export async function createMany(input: ManyInput): Promise<ActionResult & { count?: number }> {
  const auth = await requireAuth();
  const parsed = ManySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const hid = auth.householdId;
  if (!(await belongs(hid, schema.participants, [...(d.payerId ? [d.payerId] : []), ...d.splitIds]))) return { ok: false, error: "Pessoa inválida." };
  const cats = [...new Set(d.rows.map((r) => r.categoryId).filter((c): c is string => !!c))];
  if (!(await belongs(hid, schema.categories, cats))) return { ok: false, error: "Categoria inválida." };
  if (d.projectId && !(await belongs(hid, schema.projects, [d.projectId]))) return { ok: false, error: "Projeto inválido." };
  if (d.cardId) {
    const card = await loadCard(hid, d.cardId);
    if (!card) return { ok: false, error: "Cartão inválido." };
    if (!canManageCard(auth, card)) return { ok: false, error: "Você só pode usar os seus cartões." };
    // No cartão, quem pagou é sempre o dono dele.
    if (card.ownerId) d.payerId = card.ownerId;
  }

  // Linhas sem categoria usam as regras de Ajustes → Categorias.
  const rules = await loadRules(hid);
  for (const r of d.rows) r.categoryId = d.kind === "income" || r.noCategory ? null : r.categoryId ?? matchCategory(r.description, rules);

  const db = getDb();
  const count = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(schema.transactions)
      .values(
        d.rows.map((r) => ({
          householdId: hid,
          date: r.date,
          description: r.description,
          amountCents: r.amountCents,
          kind: d.kind,
          payerId: d.payerId,
          categoryId: r.categoryId,
          noCategory: d.kind === "expense" && !r.categoryId && !!r.noCategory,
          projectId: d.projectId,
          cardId: d.kind === "income" ? null : d.cardId,
          source: "manual",
          createdBy: auth.userId,
        })),
      )
      .returning({ id: schema.transactions.id, amountCents: schema.transactions.amountCents, description: schema.transactions.description });
    await tx.insert(schema.transactionSplits).values(
      rows.flatMap((r) => {
        const parts = splitEqually(r.amountCents, d.splitIds.length);
        return d.splitIds.map((participantId, i) => ({ transactionId: r.id, participantId, amountCents: parts[i] })).filter((x) => x.amountCents > 0);
      }),
    );
    const audience = involved({ payerId: d.payerId, splits: d.splitIds.map((participantId) => ({ participantId, amountCents: 0 })) });
    await logActivity(tx, auth, { action: "batch", data: { items: rows.map((r) => ({ d: r.description, a: audience })) }, audience });
    return rows.length;
  });
  revalidatePath("/", "layout");
  return { ok: true, count, message: `${count} ${count === 1 ? "lançamento criado" : "lançamentos criados"}.` };
}
