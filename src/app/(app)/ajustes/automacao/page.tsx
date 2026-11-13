import type { Metadata } from "next";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { AutoAcceptEditor } from "@/components/auto-accept-editor";
import { requireAuth } from "@/lib/auth";
import { getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Automação" };

/** Aceite automático: o que você já sabe que vai aceitar, entra sozinho. Só suas regras. */
export default async function AutomationPage() {
  const auth = await requireAuth();
  const db = getDb();
  const [lookups, rules, members] = await Promise.all([
    getLookupsFor(auth),
    db.select().from(schema.autoAcceptRules).where(and(eq(schema.autoAcceptRules.householdId, auth.householdId), eq(schema.autoAcceptRules.participantId, auth.participantId ?? ""))),
    db.select({ pid: schema.memberships.participantId }).from(schema.memberships).where(and(eq(schema.memberships.householdId, auth.householdId), isNotNull(schema.memberships.participantId))),
  ]);
  const names = new Map(lookups.participants.map((p) => [p.id, p.name]));
  const memberIds = new Set(members.map((m) => m.pid));
  return (
    <AutoAcceptEditor
      currency={auth.currency}
      people={lookups.participants.filter((p) => memberIds.has(p.id) && p.id !== auth.participantId).map((p) => ({ value: p.id, label: p.name }))}
      rules={rules.map((r) => ({ id: r.id, from: names.get(r.fromParticipantId) ?? "Alguém", maxCents: r.maxCents, match: r.match }))}
    />
  );
}
