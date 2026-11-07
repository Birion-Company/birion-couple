import type { Metadata } from "next";
import { DangerZone, HouseholdForm, MeForm } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const auth = await requireAuth();
  const { participants } = await getLookups(auth.householdId);
  return (
    <div className="grid">
      <HouseholdForm name={auth.householdName} currency={auth.currency} isOwner={auth.role === "owner"} />
      <MeForm participants={participants} current={auth.participantId} />
      {auth.role === "owner" && <DangerZone householdName={auth.householdName} />}
    </div>
  );
}
