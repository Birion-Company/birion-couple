import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Settings2 } from "lucide-react";
import { PasswordForm, ProfileForm } from "@/components/profile-forms";
import { MeForm } from "@/components/settings-panels";
import { Avatar } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const auth = await requireAuth();
  const { participants } = await getLookups(auth.householdId);
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar name={auth.userName} color="#1AC4DB" size={52} />
          <div>
            <h1>Meu perfil</h1>
            <p className="muted">
              {auth.householdName} · {auth.role === "owner" ? "administra a família" : "membro"}
            </p>
          </div>
        </div>
      </div>
      <div className="grid">
        <ProfileForm name={auth.userName} email={auth.email} />
        <MeForm participants={participants} current={auth.participantId} />
        <PasswordForm />
        <Link href="/ajustes" className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="tile-icon" aria-hidden>
            <Settings2 size={20} strokeWidth={1.8} />
          </span>
          <span className="grow" style={{ flex: 1 }}>
            <strong style={{ fontWeight: 600 }}>Ajustes da família</strong>
            <span className="faint" style={{ display: "block" }}>Pessoas, categorias, projetos, status e acesso</span>
          </span>
          <ChevronRight size={18} strokeWidth={1.8} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
