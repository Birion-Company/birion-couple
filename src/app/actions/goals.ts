"use server";

import { and, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { LIMITS, limitMessage } from "@/lib/defaults";
import { parseAmountToCents } from "@/lib/money";
import type { ActionResult } from "./settings";
import { updateReturning } from "@/db/ops";

const G = schema.goals;
/** A meta é sua, ou é uma meta do casal criada por quem está no mesmo casal. */
const mine = (auth: { userId: string; householdId: string }) =>
  or(eq(G.userId, auth.userId), and(eq(G.shared, true), sql`${G.userId} in (select "userId" from "memberships" where "householdId" = ${auth.householdId})`))!;
const MAX = 1_000_000_00;

export async function createGoal(name: string, amount: string, targetMonth: string, shared = false): Promise<ActionResult> {
  const auth = await requireAuth();
  const n = name.trim().slice(0, 60);
  if (!n) return { ok: false, error: "Dê um nome para a meta." };
  const cents = parseAmountToCents(amount, ",");
  if (cents === null || cents <= 0 || cents > MAX) return { ok: false, error: "Digite o valor da meta." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) return { ok: false, error: "Escolha o mês final." };
  const [{ c }] = await getDb().select({ c: sql<number>`count(*)` }).from(G).where(eq(G.userId, auth.userId));
  if (c >= LIMITS.goals) return { ok: false, error: limitMessage("metas", LIMITS.goals) };
  await getDb().insert(G).values({ userId: auth.userId, name: n, targetCents: cents, targetMonth, shared });
  revalidatePath("/", "layout");
  return { ok: true, message: `Meta "${n}" criada.` };
}

/** Soma (ou tira, com sinal negativo) um valor guardado; nunca fica abaixo de zero. */
export async function saveToGoal(id: string, amount: string, sign: 1 | -1 = 1): Promise<ActionResult> {
  const auth = await requireAuth();
  const cents = parseAmountToCents(amount, ",");
  if (cents === null || cents <= 0 || cents > MAX) return { ok: false, error: "Digite um valor maior que zero." };
  const res = await updateReturning(getDb(), G, { savedCents: sql`greatest(0, ${G.savedCents} + ${sign * cents})` }, and(eq(G.id, id), mine(auth)), { id: G.id });
  if (!res.length) return { ok: false, error: "Meta não encontrada." };
  revalidatePath("/", "layout");
  return { ok: true, message: sign === 1 ? "Valor guardado." : "Valor retirado." };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  await getDb().delete(G).where(and(eq(G.id, id), mine(auth)));
  revalidatePath("/", "layout");
  return { ok: true, message: "Meta apagada." };
}
