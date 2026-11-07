import type { Metadata } from "next";
import { ImportWizard } from "@/components/import-wizard";
import { requireAuth } from "@/lib/auth";
import { getImportBatches, getLookups, getPresets } from "@/lib/queries";

export const metadata: Metadata = { title: "Importar" };

export default async function ImportPage() {
  const auth = await requireAuth();
  const [lookups, presets, batches] = await Promise.all([
    getLookups(auth.householdId),
    getPresets(auth.householdId),
    getImportBatches(auth.householdId),
  ]);
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1>Importar extrato</h1>
          <p className="muted">Traga lançamentos de um arquivo OFX ou CSV. O que já foi importado é reconhecido e fica de fora.</p>
        </div>
      </div>
      <ImportWizard
        lookups={lookups}
        presets={presets.map((p) => ({ id: p.id, name: p.name, mapping: p.mapping }))}
        currency={auth.currency}
        me={auth.participantId}
      />
      {batches.length > 0 && (
        <section className="card section" aria-labelledby="hist">
          <h2 id="hist" style={{ marginBottom: 8 }}>Importações recentes</h2>
          <div className="rows">
            {batches.map((b) => (
              <div key={b.id} className="row">
                <div className="grow">
                  <p className="title">{b.fileName}</p>
                  <p className="sub">
                    {b.createdAt.toLocaleDateString("pt-BR")} · {b.format.toUpperCase()}
                  </p>
                </div>
                <span className="faint num">
                  {b.imported} novos{b.skipped ? ` · ${b.skipped} ignorados` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
