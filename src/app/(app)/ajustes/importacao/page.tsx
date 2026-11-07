import type { Metadata } from "next";
import { PresetsPanel } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";
import { getPresets } from "@/lib/queries";

export const metadata: Metadata = { title: "Importação" };

export default async function ImportSettingsPage() {
  const auth = await requireAuth();
  const presets = await getPresets(auth.householdId);
  return <PresetsPanel presets={presets.map((p) => ({ id: p.id, name: p.name }))} />;
}
