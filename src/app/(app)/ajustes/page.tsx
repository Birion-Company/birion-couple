import type { Metadata } from "next";
import { DangerZone, HouseholdForm } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const auth = await requireAuth();
  return (
    <div className="grid">
      <HouseholdForm name={auth.householdName} currency={auth.currency} isOwner={auth.role === "owner"} />
      {/* Qualquer pessoa pode apagar o que ela mesma lançou (não existe mais "excluir a família"). */}
      <DangerZone />
    </div>
  );
}
