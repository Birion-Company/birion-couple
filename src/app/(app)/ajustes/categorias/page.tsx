import type { Metadata } from "next";
import { ListEditor } from "@/components/list-editor";
import { RulesEditor } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";
import { getLookups, getRules } from "@/lib/queries";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage() {
  const auth = await requireAuth();
  const [{ categories }, rules] = await Promise.all([getLookups(auth.householdId), getRules(auth.householdId)]);
  return (
    <>
      <ListEditor kind="categories" items={categories} />
      <h2 className="section" style={{ marginBottom: 10 }}>Categorização automática</h2>
      <RulesEditor rules={rules} categories={categories} />
    </>
  );
}
