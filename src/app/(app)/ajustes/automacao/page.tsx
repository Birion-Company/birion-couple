import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { learnedByMerchant, REUSE_WINDOW } from "@/lib/patterns-server";
import { getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Automação" };

/**
 * Automação: ao importar um mês novo, o app reaproveita o que já fez no mesmo lugar (categoria e quem divide).
 * Se o histórico do lugar varia, ele não decide sozinho: deixa em "A identificar" para você conferir.
 */
export default async function AutomationPage() {
  const auth = await requireAuth();
  const [lookups, learned] = await Promise.all([getLookupsFor(auth), learnedByMerchant(auth.householdId)]);
  const cats = new Map(lookups.categories.map((c) => [c.id, c.name]));
  const names = new Map(lookups.participants.map((p) => [p.id, p.name]));
  const rows = [...learned].filter(([, l]) => l.seen >= 2).sort((a, b) => b[1].seen - a[1].seen).slice(0, 40);
  return (
      <section className="card">
        <h2>Ao importar um mês novo</h2>
        <p className="faint">
          O que sempre foi igual no mesmo lugar entra pronto. Se já variou nas últimas {REUSE_WINDOW} vezes (o uber quase sempre é seu, mas às vezes é de
          outra pessoa), o lançamento entra e fica em <strong>A identificar</strong> até você confirmar. Nada se perde.
        </p>
        {rows.length === 0 ? (
          <div className="empty">Ainda não há o que reaproveitar. Depois da primeira importação, os lugares aparecem aqui.</div>
        ) : (
          <div className="rows">
            {rows.map(([key, l]) => (
              <div key={key} className="row">
                <div className="grow">
                  <p className="title">{key}</p>
                  <p className="sub">
                    {l.categoryId ? cats.get(l.categoryId) ?? "Categoria" : "Sem categoria"} ·{" "}
                    {l.participantIds.length ? l.participantIds.map((id) => names.get(id) ?? "?").join(" e ") : "sem divisão"} · {l.seen}x
                  </p>
                </div>
                <span className={l.consistent ? "badge" : "badge warn"}>{l.consistent ? "automático" : "você confere"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
  );
}
