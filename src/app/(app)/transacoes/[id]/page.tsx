import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TxForm } from "@/components/tx-form";
import { requireAuth } from "@/lib/auth";
import { canEditTx } from "@/lib/access";
import { getLookupsFor, getMembers, getTransaction } from "@/lib/queries";

export const metadata: Metadata = { title: "Editar lançamento" };

const SOURCES: Record<string, string> = { manual: "lançado à mão", ofx: "importado de OFX", csv: "importado de CSV" };

export default async function EditTransactionPage({ params }: PageProps<"/transacoes/[id]">) {
  const auth = await requireAuth();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [lookups, tx, members] = await Promise.all([getLookupsFor(auth), getTransaction(auth, id), getMembers(auth.householdId)]);
  // Quem não está envolvido nem administra a família não vê: 404, como se não existisse.
  if (!tx) notFound();
  const canEdit = canEditTx(auth, tx.createdBy);
  const createdByName = members.find((m) => m.userId === tx.createdBy)?.name ?? null;
  return (
    <div className="tx-page">
      <div className="page-head">
        <div>
          <h1>{canEdit ? "Editar lançamento" : "Lançamento"}</h1>
          <p className="faint">{SOURCES[tx.source] ?? tx.source}</p>
        </div>
      </div>
      <div className="card">
        <TxForm lookups={lookups} currency={auth.currency} initial={tx} defaultStatusId={null} me={auth.participantId} readOnly={!canEdit} createdByName={createdByName} />
      </div>
    </div>
  );
}
