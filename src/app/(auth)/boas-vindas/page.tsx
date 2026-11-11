import type { Metadata } from "next";
import { WelcomeForm } from "@/components/auth/welcome-form";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Boas-vindas" };

/** Primeiro acesso pelo Google: confirmar o nome (e o da família) antes de usar o app. */
export default async function WelcomePage() {
  const auth = await requireAuth();
  return <WelcomeForm name={auth.userName} household={auth.householdName} canRenameHousehold={auth.role === "owner"} />;
}
