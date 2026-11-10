import type { Metadata } from "next";
import { ExportPanel } from "@/components/export-panel";
import { requireAuth } from "@/lib/auth";
import { defaultPanelMonth } from "@/lib/card-queries";
import { addMonthsKey } from "@/lib/cards";

import { navigableMonths } from "@/lib/queries";

export const metadata: Metadata = { title: "Exportação" };

export default async function ExportPage() {
  const auth = await requireAuth();
  const current = await defaultPanelMonth(auth);
  // Do primeiro mês de uso ao último com algo lançado (o mais novo primeiro).
  const { first, last } = await navigableMonths(auth.householdId, current);
  const months: string[] = [];
  for (let k = last; k >= first; k = addMonthsKey(k, -1)) months.push(k);
  return <ExportPanel months={months} initial={current} />;
}
