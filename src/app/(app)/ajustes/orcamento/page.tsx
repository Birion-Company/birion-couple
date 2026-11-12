import type { Metadata } from "next";
import { BudgetEditor } from "@/components/budget-editor";
import { requireAuth } from "@/lib/auth";
import { getBudgets, spentByCategory } from "@/lib/budgets";
import { todayIn } from "@/lib/cards";
import { getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Orçamento" };

/** Limite mensal por categoria, só seu: cada pessoa define os próprios. Mostra o quanto já gastou neste mês. */
export default async function BudgetPage() {
  const auth = await requireAuth();
  const month = todayIn().slice(0, 7);
  const [lookups, budgets, spent] = await Promise.all([getLookupsFor(auth), getBudgets(auth.userId), spentByCategory(auth, month)]);
  const limitOf = new Map(budgets.map((b) => [b.categoryId, b.monthlyCents]));
  return (
    <BudgetEditor
      currency={auth.currency}
      rows={lookups.categories
        .filter((c) => !c.archived)
        .map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon ?? null, limitCents: limitOf.get(c.id) ?? null, spentCents: spent.get(c.id) ?? 0 }))}
    />
  );
}
