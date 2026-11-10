import type { Metadata } from "next";
import { ExportPanel } from "@/components/export-panel";
import { requireAuth } from "@/lib/auth";
import { defaultPanelMonth } from "@/lib/card-queries";
import { addMonthsKey } from "@/lib/cards";
import { MONTHS_AHEAD, thisMonthKey } from "@/lib/filters";
import { householdStartMonth } from "@/lib/queries";

export const metadata: Metadata = { title: "Exportação" };

export default async function ExportPage() {
  const auth = await requireAuth();
  const [current, started] = await Promise.all([defaultPanelMonth(auth), householdStartMonth(auth.householdId)]);
  // Do primeiro mês de uso até 12 meses à frente (o mais novo primeiro).
  const first = started < current ? started : current;
  const last = addMonthsKey(thisMonthKey(), MONTHS_AHEAD);
  const months: string[] = [];
  for (let k = last; k >= first; k = addMonthsKey(k, -1)) months.push(k);
  return <ExportPanel months={months} initial={current} />;
}
