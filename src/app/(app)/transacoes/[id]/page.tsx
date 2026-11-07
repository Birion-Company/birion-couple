import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TxForm } from "@/components/tx-form";
import { requireAuth } from "@/lib/auth";
import { getLookups, getTransaction } from "@/lib/queries";

export const metadata: Metadata = { title: "Editar lançamento" };

const SOURCES: Record<string, string> = { manual: "lançado à mão", ofx: "importado de OFX", csv: "importado de CSV" };

export default async function EditTransactionPage({ params }: PageProps<"/transacoes/[id]">) {
  const auth = await requireAuth();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [lookups, tx] = await Promise.all([getLookups(auth.householdId), getTransaction(auth.householdId, id)]);
  if (!tx) notFound();
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="page-head">
        <div>
          <h1>Editar lançamento</h1>
          <p className="faint">{SOURCES[tx.source] ?? tx.source}</p>
        </div>
      </div>
      <div className="card">
        <TxForm lookups={lookups} currency={auth.currency} initial={tx} defaultStatusId={null} me={auth.participantId} />
      </div>
    </div>
  );
}
