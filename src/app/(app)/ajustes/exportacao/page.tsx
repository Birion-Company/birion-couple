import type { Metadata } from "next";
import { ExportPanel } from "@/components/export-panel";
import { requireAuth } from "@/lib/auth";
import { defaultPanelMonth } from "@/lib/card-queries";
import { todayIn } from "@/lib/cards";

import { getLookupsFor, navigableMonths } from "@/lib/queries";

export const metadata: Metadata = { title: "Exportação" };

export default async function ExportPage() {
  const auth = await requireAuth();
  const current = await defaultPanelMonth(auth);
  // Do primeiro mês de uso ao último com algo lançado.
  const [{ first, last }, lookups] = await Promise.all([
    navigableMonths(auth.householdId, current),
    getLookupsFor(auth),
  ]);
  // De quem pode ser o extrato: você ou qualquer pessoa da família (com ou sem login).
  const people = lookups.participants
    .filter((p) => !p.archived || p.id === auth.participantId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      avatarUrl: p.avatarUrl ?? null,
      hasLogin: !!p.hasLogin,
    }));
  return (
    <ExportPanel
      min={first}
      max={last}
      initial={current}
      current={todayIn().slice(0, 7)}
      people={people}
      me={auth.participantId}
    />
  );
}
