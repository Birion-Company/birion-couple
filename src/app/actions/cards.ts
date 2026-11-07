"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import type { ActionResult } from "./settings";

const day = (what: string) =>
  z.number({ error: `Escolha o dia de ${what}.` }).int().min(1, { error: `O dia de ${what} vai de 1 a 31.` }).max(31, { error: `O dia de ${what} vai de 1 a 31.` });

const CardSchema = z.object({
  name: z.string().trim().min(1, { error: "Dê um nome para o cartão." }).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "Cor inválida." }),
  closingDay: day("fechamento"),
  dueDay: day("vencimento"),
  alertDays: z.number().int().min(0).max(15).nullable(),
  holderId: z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null),
});

export type CardInput = z.input<typeof CardSchema>;

export async function saveCard(id: string | null, input: CardInput): Promise<ActionResult & { id?: string }> {
  const auth = await requireAuth();
  const parsed = CardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  if (data.closingDay === data.dueDay) return { ok: false, error: "O vencimento precisa ser em outro dia que o fechamento." };
  const db = getDb();
  if (data.holderId) {
    const [p] = await db
      .select({ id: schema.participants.id })
      .from(schema.participants)
      .where(and(eq(schema.participants.id, data.holderId), eq(schema.participants.householdId, auth.householdId)));
    if (!p) return { ok: false, error: "Pessoa inválida." };
  }
  let savedId = id;
  if (id) {
    const updated = await db
      .update(schema.creditCards)
      .set(data)
      .where(and(eq(schema.creditCards.id, id), eq(schema.creditCards.householdId, auth.householdId)))
      .returning({ id: schema.creditCards.id });
    if (updated.length === 0) return { ok: false, error: "Cartão não encontrado." };
  } else {
    const [row] = await db
      .insert(schema.creditCards)
      .values({ ...data, householdId: auth.householdId })
      .returning({ id: schema.creditCards.id });
    savedId = row.id;
  }
  revalidatePath("/", "layout");
  return { ok: true, id: savedId!, message: id ? "Cartão atualizado." : "Cartão cadastrado." };
}

export async function setCardArchived(id: string, archived: boolean): Promise<ActionResult> {
  const auth = await requireAuth();
  await getDb()
    .update(schema.creditCards)
    .set({ archived })
    .where(and(eq(schema.creditCards.id, z.uuid().parse(id)), eq(schema.creditCards.householdId, auth.householdId)));
  revalidatePath("/", "layout");
  return { ok: true, message: archived ? "Cartão arquivado. Os lançamentos continuam, mas ele some das opções e dos avisos." : "Cartão reativado." };
}

/** Exclui o cartão. Os lançamentos ficam, só deixam de estar ligados a ele. */
export async function deleteCard(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  await getDb()
    .delete(schema.creditCards)
    .where(and(eq(schema.creditCards.id, z.uuid().parse(id)), eq(schema.creditCards.householdId, auth.householdId)));
  revalidatePath("/", "layout");
  return { ok: true, message: "Cartão excluído. Os lançamentos dele foram mantidos." };
}
