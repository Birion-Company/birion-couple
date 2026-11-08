import type { Metadata } from "next";
import { BatchForm } from "@/components/batch-form";
import { requireAuth } from "@/lib/auth";
import { getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Lançar vários" };

export default async function BatchPage() {
  const auth = await requireAuth();
  const lookups = await getLookupsFor(auth);
  const defaultStatus = lookups.statuses.find((s) => s.isDefault && !s.archived) ?? lookups.statuses.find((s) => !s.archived);
  return (
    <div className="tx-page">
      <div className="page-head">
        <div>
          <h1>Lançar vários</h1>
          <p className="muted">Preencha uma linha por lançamento. Quem pagou, a divisão, o cartão e o status de cima valem para todas.</p>
        </div>
      </div>
      <BatchForm lookups={lookups} currency={auth.currency} me={auth.participantId} defaultStatusId={defaultStatus?.id ?? null} />
    </div>
  );
}
