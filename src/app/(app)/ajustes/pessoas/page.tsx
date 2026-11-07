import type { Metadata } from "next";
import { ListEditor } from "@/components/list-editor";
import { requireAuth } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PeoplePage() {
  const auth = await requireAuth();
  const { participants } = await getLookups(auth.householdId);
  return (
    <>
      <p className="faint" style={{ marginBottom: 12 }}>
        Quem divide as contas. Não precisa ter login: cadastre mãe, namorada, colegas de casa… Para dar acesso ao app, use a aba Acesso.
      </p>
      <ListEditor kind="participants" items={participants} />
    </>
  );
}
