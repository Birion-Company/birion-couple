"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import type { ActionResult } from "./settings";

const R = schema.autoAcceptRules;

/** Cria uma regra: aceitar sozinho o que [fromId] lançar para você, opcionalmente até um valor e/ou com certo texto. */
export async function createAutoRule(fromId: string, max: string, match: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const me = auth.participantId;
  if (!me) return { ok: false, error: "Sua conta não está ligada a uma pessoa da família." };
  if (fromId === me) return { ok: false, error: "Escolha outra pessoa." };
  const db = getDb();
  // Só vale para quem tem login na família (contatos não lançam nada).
  const [from] = await db
    .select({ id: schema.memberships.participantId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.participantId, fromId)));
  if (!from) return { ok: false, error: "Escolha alguém da família com login." };
  let maxCents: number | null = null;
  if (max.trim()) {
    maxCents = parseAmountToCents(max, ",");
    if (maxCents === null || maxCents <= 0 || maxCents > 1_000_000_00) return { ok: false, error: "Valor máximo inválido." };
  }
  const text = match.trim().slice(0, 60) || null;
  await db.insert(R).values({ householdId: auth.householdId, participantId: me, fromParticipantId: fromId, maxCents, match: text });
  revalidatePath("/", "layout");
  return { ok: true, message: "Regra criada. Vale para o que for lançado daqui para frente." };
}

export async function deleteAutoRule(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const me = auth.participantId;
  if (!me) return { ok: false, error: "Sem pessoa ligada à conta." };
  await getDb().delete(R).where(and(eq(R.id, id), eq(R.participantId, me), eq(R.householdId, auth.householdId)));
  revalidatePath("/", "layout");
  return { ok: true, message: "Regra apagada." };
}
