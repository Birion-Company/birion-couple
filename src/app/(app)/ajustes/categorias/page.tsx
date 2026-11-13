import type { Metadata } from "next";
import { BudgetEditor } from "@/components/budget-editor";
import { ListEditor } from "@/components/list-editor";
import { RulesEditor } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";
import { getBudgets, spentByCategory } from "@/lib/budgets";
import { todayIn } from "@/lib/cards";
import { getLookups, getRules } from "@/lib/queries";

export const metadata: Metadata = { title: "Categorias" };

/** Categorias, o limite de cada uma por mês (orçamento) e as regras que categorizam sozinhas. */
export default async function CategoriesPage() {
  const auth = await requireAuth();
  const month = todayIn().slice(0, 7);
  const [{ categories }, rules, budgets, spent] = await Promise.all([
    getLookups(auth.householdId, auth.userId),
    getRules(auth.householdId),
    getBudgets(auth.userId),
    spentByCategory(auth, month),
  ]);
  const limitOf = new Map(budgets.map((b) => [b.categoryId, b.monthlyCents]));
  return (
    <>
      <ListEditor kind="categories" items={categories} />
      <div className="section" />
      <BudgetEditor
        currency={auth.currency}
        rows={categories
          .filter((c) => !c.archived)
          .map((c) => ({ id: c.id, name: c.name, color: c.color ?? "#94A3B8", icon: c.icon ?? null, limitCents: limitOf.get(c.id) ?? null, spentCents: spent.get(c.id) ?? 0 }))}
      />
      <h2 className="section" style={{ marginBottom: 10 }}>Regras automáticas</h2>
      <RulesEditor rules={rules} categories={categories} />
    </>
  );
}
