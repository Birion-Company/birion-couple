"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { checkEditable } from "@/lib/access";
import { involved, logActivity, snapshots } from "@/lib/activity";
import { requireAuth } from "@/lib/auth";
import type { ActionResult } from "./settings";

/**
 * "Confirmar" uma compra recebida de fora (A identificar): ela passa a valer nas listas, na fatura e nas dívidas.
 * Se a pessoa atribuiu a divisão a alguém, esse alguém é avisado agora (e pode aceitar, ou a regra de aceite automático aceita).
 */
export async function confirmPurchase(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const denied = await checkEditable(auth, [id]);
  if (denied) return { ok: false, error: denied };
  const db = getDb();
  const T = schema.transactions;
  const [row] = await db.select({ id: T.id, needsReview: T.needsReview }).from(T).where(and(eq(T.id, id), eq(T.householdId, auth.householdId)));
  if (!row?.needsReview) return { ok: false, error: "Este lançamento já foi confirmado." };
  await db.transaction(async (tx) => {
    await tx.update(T).set({ needsReview: false, createdAt: new Date() }).where(eq(T.id, id));
    const snap = (await snapshots(tx, auth.householdId, [id])).get(id);
    if (snap) await logActivity(tx, auth, { action: "created", transactionId: id, data: { tx: snap }, audience: involved(snap) });
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Confirmado." };
}

/** "Confirmar" um lançamento reaproveitado de importação cujo histórico varia: sai de A identificar. */
export async function confirmReuse(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const denied = await checkEditable(auth, [id]);
  if (denied) return { ok: false, error: denied };
  const T = schema.transactions;
  await getDb().update(T).set({ reuseCheck: false }).where(and(eq(T.id, id), eq(T.householdId, auth.householdId)));
  revalidatePath("/", "layout");
  return { ok: true, message: "Confirmado." };
}
