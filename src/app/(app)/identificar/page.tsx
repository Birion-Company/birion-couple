import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { TxList } from "@/components/tx-list";
import { Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { getLookupsFor, listUnidentified } from "@/lib/queries";

export const metadata: Metadata = { title: "A identificar" };

export default async function UnidentifiedPage() {
  const auth = await requireAuth();
  const lookups = await getLookupsFor(auth);
  const rows = await listUnidentified(auth);
  const total = rows.filter((r) => r.kind === "expense").reduce((a, r) => a + r.amountCents, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>A identificar</h1>
          <p className="muted">
            {rows.length === 0 ? (
              "Tudo identificado."
            ) : (
              <>
                {rows.length} {rows.length === 1 ? "lançamento" : "lançamentos"} · <Money cents={total} currency={auth.currency} /> em despesas
              </>
            )}
          </p>
        </div>
      </div>

      <div className="notice identify-help" data-tour="identify-list">
        Aqui ficam os lançamentos que ainda não dizem <strong>o que são</strong> (categoria), <strong>quem pagou</strong> ou{" "}
        <strong>quem deveria pagar</strong> — por exemplo, os que vieram de um extrato importado. Abra um para completar, ou marque vários e
        use <strong>Editar em lote</strong>. Quando tudo estiver preenchido, ele sai daqui sozinho.
        <span className="faint"> Isso é diferente do status “Pendente”, que diz se a conta já foi paga.</span>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <CheckCircle2 size={36} strokeWidth={1.2} />
            Nenhum lançamento para identificar.
          </div>
        </div>
      ) : (
        <TxList
          rows={rows}
          lookups={lookups}
          currency={auth.currency}
          viewer={{ userId: auth.userId, admin: auth.role === "owner", participantId: auth.participantId }}
          showMissing
          emptyText="Nenhum lançamento para identificar."
        />
      )}
    </>
  );
}
