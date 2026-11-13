import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { TxForm, type TxPrefill } from "@/components/tx-form";
import { requireAuth } from "@/lib/auth";
import { getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NewTransactionPage({ searchParams }: PageProps<"/transacoes/nova">) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const lookups = await getLookupsFor(auth);
  const accounts = (await getDb().select({ id: schema.accounts.id, name: schema.accounts.name }).from(schema.accounts).where(eq(schema.accounts.userId, auth.userId)).orderBy(asc(schema.accounts.createdAt))).map((a) => ({ value: a.id, label: a.name }));
  const ids = new Set(lookups.participants.map((p) => p.id));

  // Vindo de "Como acertar" no painel: ?acerto=deId.paraId.centavos
  let prefill: TxPrefill | undefined;
  const acerto = typeof sp.acerto === "string" ? sp.acerto.split(".") : null;
  if (acerto && acerto.length === 3 && ids.has(acerto[0]) && ids.has(acerto[1]) && Number(acerto[2]) > 0) {
    prefill = { kind: "transfer", payerId: acerto[0], toId: acerto[1], amountCents: Number(acerto[2]), description: "Acerto" };
  } else if (sp.tipo === "emprestimo") {
    prefill = { kind: "loan", payerId: auth.participantId ?? undefined };
  } else if (sp.tipo === "receita") {
    prefill = { kind: "income", payerId: auth.participantId ?? undefined, accountId: typeof sp.conta === "string" ? sp.conta : undefined };
  }

  if (lookups.participants.filter((p) => !p.archived).length === 0) {
    return (
      <div className="card">
        <div className="empty">
          Convide o seu par antes de lançar.
          <div style={{ marginTop: 12 }}>
            <Link className="btn primary" href="/ajustes">Ir para Nós</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tx-page">
      <div className="page-head">
        <h1>{prefill?.kind === "transfer" ? "Registrar pagamento" : prefill?.kind === "loan" ? "Registrar dívida" : "Novo lançamento"}</h1>
      </div>
      <div className="card">
        <TxForm lookups={lookups} currency={auth.currency} initial={null} prefill={prefill} me={auth.participantId} canInvite={auth.role === "owner"} accounts={accounts} />
      </div>
    </div>
  );
}
