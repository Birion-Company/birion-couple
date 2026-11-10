"use server";

import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { PUSH_KINDS, type PushKind, type PushPrefs } from "@/lib/push-prefs";
import { pushEnabled } from "@/lib/push-server";

const SubSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(4).max(100) }),
  device: z.string().max(40).optional(),
});

/** Guarda este aparelho para receber notificações (troca a dona se o aparelho mudou de conta). */
export async function savePushSubscription(input: z.input<typeof SubSchema>) {
  const auth = await requireAuth();
  if (!pushEnabled) return { ok: false, error: "As notificações ainda não estão configuradas no servidor." };
  const parsed = SubSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Inscrição inválida." };
  const d = parsed.data;
  const ps = schema.pushSubscriptions;
  await getDb()
    .insert(ps)
    .values({ userId: auth.userId, endpoint: d.endpoint, p256dh: d.keys.p256dh, auth: d.keys.auth, device: d.device ?? null })
    .onConflictDoUpdate({ target: ps.endpoint, set: { userId: auth.userId, p256dh: d.keys.p256dh, auth: d.keys.auth, device: d.device ?? null } });
  return { ok: true, message: "Notificações ligadas neste aparelho." };
}

export async function removePushSubscription(endpoint: string) {
  const auth = await requireAuth();
  await getDb().delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, auth.userId)));
  return { ok: true, message: "Notificações desligadas neste aparelho." };
}

/** Quais notificações a pessoa quer receber. */
export async function getPushPrefs(): Promise<PushPrefs> {
  const auth = await requireAuth();
  const [u] = await getDb().select({ prefs: schema.users.pushPrefs }).from(schema.users).where(eq(schema.users.id, auth.userId));
  return (u?.prefs as PushPrefs) ?? {};
}

/** Liga ou desliga um tipo de notificação (vale para todos os aparelhos da pessoa). */
export async function setPushPref(kind: PushKind, on: boolean) {
  const auth = await requireAuth();
  if (!PUSH_KINDS.some((k) => k.key === kind) || typeof on !== "boolean") return { ok: false, error: "Opção inválida." };
  const current = await getPushPrefs();
  await getDb().update(schema.users).set({ pushPrefs: { ...current, [kind]: on } }).where(eq(schema.users.id, auth.userId));
  return { ok: true };
}
