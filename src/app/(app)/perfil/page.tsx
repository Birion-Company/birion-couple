import type { Metadata } from "next";
import { AvatarEditor, PasswordForm, ProfileForm } from "@/components/profile-forms";
import { MyColor } from "@/components/my-color";
import { requireAuth } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const auth = await requireAuth();
  const avatarUrl = auth.avatarVersion ? `/api/avatar/${auth.userId}?v=${auth.avatarVersion}` : null;
  const me = auth.participantId ? (await getLookups(auth.householdId)).participants.find((p) => p.id === auth.participantId) : null;
  return (
    <div className="profile-page">
      <section className="profile-hero" aria-label="Foto e identificação">
        <AvatarEditor name={auth.userName} avatarUrl={avatarUrl} />
        <div className="profile-id">
          <h1>{auth.userName}</h1>
          <span className="badge profile-family">
            {auth.householdName} · {auth.role === "owner" ? "administra a família" : "membro"}
          </span>
          <p className="muted">{auth.email}</p>
        </div>
      </section>
      <div className="grid">
        <ProfileForm name={auth.userName} email={auth.email} />
        <PasswordForm />
      </div>
      {me && <MyColor color={me.color} />}
    </div>
  );
}
