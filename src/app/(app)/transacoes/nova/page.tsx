import type { Metadata } from "next";
import Link from "next/link";
import { TxForm, type TxPrefill } from "@/components/tx-form";
import { requireAuth } from "@/lib/auth";
import { getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NewTransactionPage({ searchParams }: PageProps<"/transacoes/nova">) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const lookups = await getLookupsFor(auth);
  const ids = new Set(lookups.participants.map((p) => p.id));

  // Vindo de "Como acertar" no painel: ?acerto=deId.paraId.centavos
  let prefill: TxPrefill | undefined;
  const acerto = typeof sp.acerto === "string" ? sp.acerto.split(".") : null;
  if (acerto && acerto.length === 3 && ids.has(acerto[0]) && ids.has(acerto[1]) && Number(acerto[2]) > 0) {
    prefill = { kind: "transfer", payerId: acerto[0], toId: acerto[1], amountCents: Number(acerto[2]), description: "Acerto" };
  } else if (sp.tipo === "emprestimo") {
    prefill = { kind: "loan", payerId: auth.participantId ?? undefined };
  }

  if (lookups.participants.filter((p) => !p.archived).length === 0) {
    return (
      <div className="card">
        <div className="empty">
          Cadastre as pessoas da família antes de lançar.
          <div style={{ marginTop: 12 }}>
            <Link className="btn primary" href="/ajustes/pessoas">Cadastrar pessoas</Link>
          </div>
        </div>
      </div>
    );
  }

  const defaultStatus = lookups.statuses.find((s) => s.isDefault && !s.archived) ?? lookups.statuses.find((s) => !s.archived);
  return (
    <div className="tx-page">
      <div className="page-head">
        <h1>{prefill?.kind === "transfer" ? "Registrar pagamento" : prefill?.kind === "loan" ? "Registrar empréstimo" : "Novo lançamento"}</h1>
      </div>
      <div className="card">
        <TxForm lookups={lookups} currency={auth.currency} initial={null} prefill={prefill} defaultStatusId={defaultStatus?.id ?? null} me={auth.participantId} />
      </div>
    </div>
  );
}
