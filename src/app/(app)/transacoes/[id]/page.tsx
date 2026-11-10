import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TxForm } from "@/components/tx-form";
import { requireAuth } from "@/lib/auth";
import { canEditTx } from "@/lib/access";
import { getLookupsFor, getMembers, getSeriesItems, getTransaction } from "@/lib/queries";
import { SeriesEditor } from "@/components/series-editor";

export const metadata: Metadata = { title: "Editar lançamento" };

const SOURCES: Record<string, string> = {
  manual: "lançado à mão",
  ofx: "importado de OFX",
  csv: "importado de CSV",
  previsto: "parcela prevista: o extrato confirma sem duplicar.",
};

export default async function EditTransactionPage({ params, searchParams }: PageProps<"/transacoes/[id]">) {
  const auth = await requireAuth();
  const { id } = await params;
  const returnTo = (await searchParams).voltar === "identificar" ? "/identificar" : undefined;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [lookups, tx, members] = await Promise.all([getLookupsFor(auth), getTransaction(auth, id), getMembers(auth.householdId)]);
  // Quem não está envolvido nem administra a família não vê: 404, como se não existisse.
  if (!tx) notFound();
  const canEdit = canEditTx(auth, tx.createdBy);
  const createdByName = members.find((m) => m.userId === tx.createdBy)?.name ?? null;
  const series = tx.seriesId && tx.seriesTotal && canEdit ? await getSeriesItems(auth, tx.seriesId) : null;
  return (
    <div className="tx-page">
      <div className="page-head">
        <div>
          <h1>{canEdit ? "Editar lançamento" : "Lançamento"}</h1>
          <p className="faint">{SOURCES[tx.source] ?? tx.source}</p>
        </div>
      </div>
      {series && <SeriesEditor txId={tx.id} items={series} total={tx.seriesTotal!} currency={auth.currency} monthly={tx.seriesKind === "monthly"} />}
      <div className="card">
        <TxForm key={`${tx.date}-${tx.amountCents}-${tx.seriesTotal ?? 0}`} lookups={lookups} currency={auth.currency} initial={tx} me={auth.participantId} canInvite={auth.role === "owner"} readOnly={!canEdit} createdByName={createdByName} returnTo={returnTo} />
      </div>
    </div>
  );
}
