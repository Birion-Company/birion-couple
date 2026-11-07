import type { Metadata } from "next";
import { AvatarEditor, PasswordForm, ProfileForm } from "@/components/profile-forms";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const auth = await requireAuth();
  const avatarUrl = auth.avatarVersion ? `/api/avatar/${auth.userId}?v=${auth.avatarVersion}` : null;
  return (
    <div className="profile-page">
      <section className="profile-hero" aria-label="Foto e identificação">
        <AvatarEditor name={auth.userName} avatarUrl={avatarUrl} />
        <div className="profile-id">
          <h1>{auth.userName}</h1>
          <p className="muted">{auth.email}</p>
          <span className="badge">
            {auth.householdName} · {auth.role === "owner" ? "administra a família" : "membro"}
          </span>
        </div>
      </section>
      <div className="grid">
        <ProfileForm name={auth.userName} email={auth.email} />
        <PasswordForm />
      </div>
    </div>
  );
}
