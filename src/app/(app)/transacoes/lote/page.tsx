import type { Metadata } from "next";
import { BatchForm } from "@/components/batch-form";
import { requireAuth } from "@/lib/auth";
import { getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Lançar vários" };

export default async function BatchPage() {
  const auth = await requireAuth();
  const lookups = await getLookupsFor(auth);
  return (
    <div className="tx-page">
      <div className="page-head">
        <div>
          <h1>Lançar vários</h1>
          <p className="muted">Uma linha por lançamento. O que está em cima vale para todas.</p>
        </div>
      </div>
      <BatchForm lookups={lookups} currency={auth.currency} me={auth.participantId} />
    </div>
  );
}
