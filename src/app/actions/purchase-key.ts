"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { createPurchaseKey } from "@/lib/purchase-server";

/** Gera uma chave nova (a antiga deixa de valer). A chave só aparece agora. */
export async function generatePurchaseKey(): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const auth = await requireAuth();
  if (!auth.participantId) return { ok: false, error: "Sua conta não está ligada a uma pessoa da família." };
  const key = await createPurchaseKey(auth.userId);
  revalidatePath("/ajustes/automacao");
  return { ok: true, key };
}

export async function revokePurchaseKey(): Promise<{ ok: boolean }> {
  const auth = await requireAuth();
  await getDb().delete(schema.purchaseKeys).where(eq(schema.purchaseKeys.userId, auth.userId));
  revalidatePath("/ajustes/automacao");
  return { ok: true };
}
