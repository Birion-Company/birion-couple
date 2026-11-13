import type { Metadata } from "next";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { AutoAcceptEditor } from "@/components/auto-accept-editor";
import { requireAuth } from "@/lib/auth";
import { APPROVALS_OFF } from "@/lib/defaults";
import { learnedByMerchant, REUSE_WINDOW } from "@/lib/patterns-server";
import { getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Automação" };

/**
 * Automação: ao importar um mês novo, o app reaproveita o que já fez no mesmo lugar (categoria e quem divide).
 * Se o histórico do lugar varia, ele não decide sozinho: deixa em "A identificar" para você conferir.
 */
export default async function AutomationPage() {
  const auth = await requireAuth();
  const db = getDb();
  const [lookups, learned, [house], rules, members] = await Promise.all([
    getLookupsFor(auth),
    learnedByMerchant(auth.householdId),
    db.select({ from: schema.households.approvalsFrom }).from(schema.households).where(eq(schema.households.id, auth.householdId)),
    db.select().from(schema.autoAcceptRules).where(and(eq(schema.autoAcceptRules.householdId, auth.householdId), eq(schema.autoAcceptRules.participantId, auth.participantId ?? ""))),
    db.select({ pid: schema.memberships.participantId }).from(schema.memberships).where(and(eq(schema.memberships.householdId, auth.householdId), isNotNull(schema.memberships.participantId))),
  ]);
  const cats = new Map(lookups.categories.map((c) => [c.id, c.name]));
  const names = new Map(lookups.participants.map((p) => [p.id, p.name]));
  const rows = [...learned].filter(([, l]) => l.seen >= 2).sort((a, b) => b[1].seen - a[1].seen).slice(0, 40);
  const approvalsOn = !!house && house.from.getTime() < APPROVALS_OFF.getTime();
  const memberIds = new Set(members.map((m) => m.pid));
  return (
    <>
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
      {approvalsOn && (
        <div className="section">
          <AutoAcceptEditor
            currency={auth.currency}
            people={lookups.participants.filter((p) => memberIds.has(p.id) && p.id !== auth.participantId).map((p) => ({ value: p.id, label: p.name }))}
            rules={rules.map((r) => ({ id: r.id, from: names.get(r.fromParticipantId) ?? "Alguém", maxCents: r.maxCents, match: r.match }))}
          />
        </div>
      )}
    </>
  );
}
