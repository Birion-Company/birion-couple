import type { Metadata } from "next";
import { ListEditor } from "@/components/list-editor";
import { requireAuth } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Status" };

export default async function StatusPage() {
  const auth = await requireAuth();
  const { statuses } = await getLookups(auth.householdId);
  return (
    <>
      <p className="faint" style={{ marginBottom: 12 }}>
        Crie os status com os nomes que a sua família usa. O que importa para os saldos é o significado de cada um:
        pendente, pago e a acertar, ou já acertado.
      </p>
      <ListEditor kind="statuses" items={statuses} />
    </>
  );
}
