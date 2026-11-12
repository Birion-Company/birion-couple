"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import type { ActionResult } from "./settings";

const G = schema.goals;
const MAX = 1_000_000_00;

export async function createGoal(name: string, amount: string, targetMonth: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const n = name.trim().slice(0, 60);
  if (!n) return { ok: false, error: "Dê um nome para a meta." };
  const cents = parseAmountToCents(amount, ",");
  if (cents === null || cents <= 0 || cents > MAX) return { ok: false, error: "Digite o valor da meta." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) return { ok: false, error: "Escolha o mês final." };
  await getDb().insert(G).values({ userId: auth.userId, name: n, targetCents: cents, targetMonth });
  revalidatePath("/", "layout");
  return { ok: true, message: `Meta "${n}" criada.` };
}

/** Soma (ou tira, com sinal negativo) um valor guardado; nunca fica abaixo de zero. */
export async function saveToGoal(id: string, amount: string, sign: 1 | -1 = 1): Promise<ActionResult> {
  const auth = await requireAuth();
  const cents = parseAmountToCents(amount, ",");
  if (cents === null || cents <= 0 || cents > MAX) return { ok: false, error: "Digite um valor maior que zero." };
  const res = await getDb()
    .update(G)
    .set({ savedCents: sql`greatest(0, ${G.savedCents} + ${sign * cents})` })
    .where(and(eq(G.id, id), eq(G.userId, auth.userId)))
    .returning({ id: G.id });
  if (!res.length) return { ok: false, error: "Meta não encontrada." };
  revalidatePath("/", "layout");
  return { ok: true, message: sign === 1 ? "Valor guardado." : "Valor retirado." };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  await getDb().delete(G).where(and(eq(G.id, id), eq(G.userId, auth.userId)));
  revalidatePath("/", "layout");
  return { ok: true, message: "Meta apagada." };
}
