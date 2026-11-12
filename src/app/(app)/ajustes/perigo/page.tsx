import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { DangerZone } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Perigo" };

/** Ações sem volta, separadas do resto dos Ajustes para ninguém tocar sem querer. */
export default async function DangerPage() {
  await requireAuth();
  return (
    <div className="danger-page">
      <div className="danger-banner" role="note">
        <TriangleAlert size={20} strokeWidth={1.9} aria-hidden />
        <p>
          <strong>Cuidado:</strong> o que você apagar aqui <strong>não volta</strong>. Nem o Birion consegue recuperar.
        </p>
      </div>
      <DangerZone />
    </div>
  );
}
