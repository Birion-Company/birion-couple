"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { checkBudgetAlerts } from "@/lib/budgets";
import { parseAmountToCents } from "@/lib/money";
import type { ActionResult } from "./settings";

/** Define (ou tira, se vazio) o limite mensal de uma categoria para quem está logado. Só vale para a própria pessoa. */
export async function saveBudget(categoryId: string, amount: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const db = getDb();
  const [cat] = await db
    .select({ id: schema.categories.id, name: schema.categories.name })
    .from(schema.categories)
    .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.householdId, auth.householdId)));
  if (!cat) return { ok: false, error: "Categoria não encontrada." };
  const B = schema.budgets;
  if (!amount.trim()) {
    await db.delete(B).where(and(eq(B.userId, auth.userId), eq(B.categoryId, categoryId)));
    revalidatePath("/", "layout");
    return { ok: true, message: `Limite de ${cat.name} removido.` };
  }
  const cents = parseAmountToCents(amount, ",");
  if (cents === null || cents <= 0 || cents > 1_000_000_00) return { ok: false, error: "Digite um valor maior que zero." };
  await db
    .insert(B)
    .values({ userId: auth.userId, categoryId, monthlyCents: cents })
    .onConflictDoUpdate({ target: [B.userId, B.categoryId], set: { monthlyCents: cents, alertedMonth: null, alertedLevel: 0 } });
  // Já passou do novo limite? Avisa na hora (e deixa o painel certo).
  await checkBudgetAlerts(auth.householdId).catch(() => {});
  revalidatePath("/", "layout");
  return { ok: true, message: `Limite de ${cat.name} salvo.` };
}
