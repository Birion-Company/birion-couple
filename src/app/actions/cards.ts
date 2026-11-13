"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { canManageCard, isAdmin } from "@/lib/access";
import { requireAuth } from "@/lib/auth";
import { brandOf } from "@/lib/card-brands";
import { CARDS_PER_PERSON_MAX } from "@/lib/defaults";
import type { ActionResult } from "./settings";

const day = (what: string) =>
  z.number({ error: `Escolha o dia de ${what}.` }).int().min(1, { error: `O dia de ${what} vai de 1 a 31.` }).max(31, { error: `O dia de ${what} vai de 1 a 31.` });

const CardSchema = z.object({
  name: z.string().trim().min(1, { error: "Dê um nome para o cartão." }).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "Cor inválida." }),
  closingDay: day("fechamento"),
  dueDay: day("vencimento"),
  alertDays: z.number().int().min(0).max(15).nullable(),
});

export type CardInput = z.input<typeof CardSchema> & { ownerId?: string | null };

const FULL = `Limite de ${CARDS_PER_PERSON_MAX} cartões ativos. Arquive um antes.`;

/** Quantos cartões ativos a pessoa já tem (sem contar `exceptId`). */
async function activeCards(householdId: string, ownerId: string, exceptId?: string) {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(schema.creditCards)
    .where(
      and(
        eq(schema.creditCards.householdId, householdId),
        eq(schema.creditCards.ownerId, ownerId),
        eq(schema.creditCards.archived, false),
        exceptId ? ne(schema.creditCards.id, exceptId) : undefined,
      ),
    );
  return n;
}

async function findCard(householdId: string, id: string) {
  const [card] = await getDb()
    .select()
    .from(schema.creditCards)
    .where(and(eq(schema.creditCards.id, id), eq(schema.creditCards.householdId, householdId)));
  return card ?? null;
}

const NOT_YOUR_CARD = "Só o dono do cartão pode mexer nele.";

export async function saveCard(id: string | null, input: CardInput): Promise<ActionResult & { id?: string }> {
  const auth = await requireAuth();
  const parsed = CardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  if (data.closingDay === data.dueDay) return { ok: false, error: "O vencimento precisa ser em outro dia que o fechamento." };
  const db = getDb();

  // Dono: quem administra pode escolher qualquer pessoa da família; os outros só cadastram para si.
  let ownerId: string | null = isAdmin(auth) ? (input.ownerId || auth.participantId) : auth.participantId;
  if (!ownerId) return { ok: false, error: "Sua conta não está ligada a uma pessoa da família; peça para quem administra." };
  const id0 = id ? z.uuid().safeParse(id) : null;
  if (id0 && !id0.success) return { ok: false, error: "Cartão inválido." };
  const current = id ? await findCard(auth.householdId, id) : null;
  if (id && !current) return { ok: false, error: "Cartão não encontrado." };
  if (current && !canManageCard(auth, current)) return { ok: false, error: NOT_YOUR_CARD };
  if (current && !isAdmin(auth)) ownerId = current.ownerId;
  const [owner] = await db
    .select({ id: schema.participants.id })
    .from(schema.participants)
    .where(and(eq(schema.participants.id, ownerId!), eq(schema.participants.householdId, auth.householdId)));
  if (!owner) return { ok: false, error: "Pessoa inválida." };
  const willBeActive = !current || !current.archived;
  if (willBeActive && (await activeCards(auth.householdId, ownerId!, current?.id)) >= CARDS_PER_PERSON_MAX) return { ok: false, error: FULL };

  let savedId = id;
  if (current) {
    // O nome (e a cor da marca) não mudam depois de cadastrado: só fechamento, vencimento, avisos e dono.
    await db
      .update(schema.creditCards)
      .set({ closingDay: data.closingDay, dueDay: data.dueDay, alertDays: data.alertDays, ownerId })
      .where(eq(schema.creditCards.id, current.id));
  } else {
    // Cartão novo: o nome vem da lista de cartões prontos e a cor é a da marca.
    const brand = brandOf(data.name);
    if (!brand) return { ok: false, error: "Escolha o cartão na lista." };
    data.name = brand.name;
    data.color = brand.color;
    const [row] = await db
      .insert(schema.creditCards)
      .values({ ...data, ownerId, householdId: auth.householdId })
      .returning({ id: schema.creditCards.id });
    savedId = row.id;
  }
  revalidatePath("/", "layout");
  return { ok: true, id: savedId!, message: id ? "Cartão atualizado." : "Cartão cadastrado." };
}

export async function setCardArchived(id: string, archived: boolean): Promise<ActionResult> {
  const auth = await requireAuth();
  const card = await findCard(auth.householdId, z.uuid().parse(id));
  if (!card) return { ok: false, error: "Cartão não encontrado." };
  if (!canManageCard(auth, card)) return { ok: false, error: NOT_YOUR_CARD };
  if (!archived && card.ownerId && (await activeCards(auth.householdId, card.ownerId, card.id)) >= CARDS_PER_PERSON_MAX) return { ok: false, error: FULL };
  await getDb().update(schema.creditCards).set({ archived }).where(eq(schema.creditCards.id, card.id));
  revalidatePath("/", "layout");
  return { ok: true, message: archived ? "Cartão arquivado. Os lançamentos continuam, mas ele some das opções e dos avisos." : "Cartão reativado." };
}

/** Exclui o cartão. Os lançamentos ficam, só deixam de estar ligados a ele. */
export async function deleteCard(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const card = await findCard(auth.householdId, z.uuid().parse(id));
  if (!card) return { ok: false, error: "Cartão não encontrado." };
  if (!canManageCard(auth, card)) return { ok: false, error: NOT_YOUR_CARD };
  await getDb().delete(schema.creditCards).where(eq(schema.creditCards.id, card.id));
  revalidatePath("/", "layout");
  return { ok: true, message: "Cartão excluído. Os lançamentos dele foram mantidos." };
}
