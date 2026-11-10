import type { Metadata } from "next";
import { ListEditor } from "@/components/list-editor";
import { TempPeopleList } from "@/components/temp-people-list";
import { requireAuth } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PeoplePage() {
  const auth = await requireAuth();
  const { participants } = await getLookups(auth.householdId);
  return (
    <>
      {/* Você não aparece aqui: seu nome e sua foto ficam no seu perfil (e a cor também). */}
      <ListEditor kind="participants" items={participants.filter((p) => !p.temporary && p.id !== auth.participantId)} hidden={auth.role === "owner" ? 0 : 1} />
      <TempPeopleList people={participants.filter((p) => p.temporary)} />
    </>
  );
}
