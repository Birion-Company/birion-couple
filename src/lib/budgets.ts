import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { todayIn } from "./cards";
import { formatMoney } from "./money";
import { parseFilters } from "./filters";
import { monthRange } from "./filters";
import { getDashboard } from "./queries";
import { sendPush } from "./push-server";

/** Quanto do limite já foi usado e em que faixa está: ok, perto (80%) ou estourado (100%). */
export type BudgetLevel = 0 | 80 | 100;
export const budgetLevel = (spentCents: number, limitCents: number): BudgetLevel => {
  if (limitCents <= 0) return 0;
  const pct = (spentCents / limitCents) * 100;
  return pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
};

/** Gasto do mês por categoria (só a parte da pessoa), pelo mesmo cálculo do painel. */
export async function spentByCategory(viewer: { householdId: string; userId: string; participantId: string | null; role: "owner" | "member" }, month: string) {
  const parsed = parseFilters({ mes: month }, "mes");
  const f = { ...parsed, period: "mes" as const, month, competence: month, ...monthRange(month), person: viewer.participantId };
  const data = await getDashboard(viewer, f);
  return new Map(data.byCategory.map((c) => [c.id, c.cents]));
}

export async function getBudgets(userId: string) {
  return getDb().select().from(schema.budgets).where(eq(schema.budgets.userId, userId));
}

/**
 * Depois que algo foi lançado: para cada pessoa da família com orçamento, avisa quando uma categoria chega a 80%
 * ou passa de 100% do limite do mês (uma vez por faixa e por mês). O estado do aviso é guardado mesmo sem push ligado.
 */
export async function checkBudgetAlerts(householdId: string) {
  const db = getDb();
  const month = todayIn().slice(0, 7);
  const rows = await db
    .select({
      userId: schema.budgets.userId,
      categoryId: schema.budgets.categoryId,
      limit: schema.budgets.monthlyCents,
      month: schema.budgets.alertedMonth,
      level: schema.budgets.alertedLevel,
      catName: schema.categories.name,
      participantId: schema.memberships.participantId,
      role: schema.memberships.role,
    })
    .from(schema.budgets)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.budgets.categoryId))
    .innerJoin(schema.memberships, and(eq(schema.memberships.userId, schema.budgets.userId), eq(schema.memberships.householdId, schema.categories.householdId)))
    .where(and(eq(schema.categories.householdId, householdId), isNotNull(schema.memberships.participantId)));
  const [house] = await db.select({ currency: schema.households.currency }).from(schema.households).where(eq(schema.households.id, householdId));
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  for (const [userId, list] of byUser) {
    const spent = await spentByCategory({ householdId, userId, participantId: list[0].participantId, role: list[0].role === "owner" ? "owner" : "member" }, month);
    for (const r of list) {
      const used = spent.get(r.categoryId) ?? 0;
      const now = budgetLevel(used, r.limit);
      const last = r.month === month ? (r.level as BudgetLevel) : 0;
      if (now === last) continue;
      await db.update(schema.budgets).set({ alertedMonth: month, alertedLevel: now }).where(and(eq(schema.budgets.userId, userId), eq(schema.budgets.categoryId, r.categoryId)));
      // Só avisa quando sobe de faixa (cair de faixa, ex.: depois de um estorno, não avisa).
      if (now > last) {
        const money = (c: number) => formatMoney(c, house?.currency ?? "BRL");
        await sendPush([userId], {
          title: now === 100 ? `Orçamento de ${r.catName} estourou` : `Orçamento de ${r.catName} chegando ao limite`,
          body: `Você já gastou ${money(used)} de ${money(r.limit)} em ${r.catName} neste mês.`,
          url: "/painel",
          tag: `orcamento-${r.categoryId}-${month}-${now}`,
        }).catch((e) => console.error("push orçamento", e));
      }
    }
  }
}
