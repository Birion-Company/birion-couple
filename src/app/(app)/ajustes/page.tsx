import type { Metadata } from "next";
import { DangerZone, HouseholdForm } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const auth = await requireAuth();
  return (
    <div className="grid">
      <HouseholdForm name={auth.householdName} currency={auth.currency} isOwner={auth.role === "owner"} />
      {auth.role === "owner" && <DangerZone householdName={auth.householdName} />}
    </div>
  );
}
