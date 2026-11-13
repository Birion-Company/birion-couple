import type { Metadata } from "next";
import { AppearancePanel } from "@/components/appearance-panel";

export const metadata: Metadata = { title: "Aparência" };

export default function AppearancePage() {
  return <AppearancePanel />;
}
