import type { Metadata } from "next";
import { ExportPanel } from "@/components/export-panel";
import { requireAuth } from "@/lib/auth";
import { defaultPanelMonth } from "@/lib/card-queries";
import { todayIn } from "@/lib/cards";

import { navigableMonths } from "@/lib/queries";

export const metadata: Metadata = { title: "Exportação" };

export default async function ExportPage() {
  const auth = await requireAuth();
  const current = await defaultPanelMonth(auth);
  // Do primeiro mês de uso ao último com algo lançado.
  const { first, last } = await navigableMonths(auth.householdId, current);
  return <ExportPanel min={first} max={last} initial={current} current={todayIn().slice(0, 7)} />;
}
