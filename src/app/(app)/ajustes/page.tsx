import type { Metadata } from "next";
import { HouseholdForm } from "@/components/settings-panels";
import { CoupleCard } from "@/components/couple-card";
import { HistoryPanel } from "@/components/family-panels";
import { PeopleSections } from "@/components/people-sections";
import { feedPage } from "@/lib/activity";
import { requireAuth } from "@/lib/auth";
import { APPROVALS_OFF } from "@/lib/defaults";
import { getFamilyLog, getInviteRequests } from "@/lib/family-log";
import { getInvites, getLookupsFor, getMembers } from "@/lib/queries";
import { getDb, schema } from "@/db";
import { count, eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Ajustes" };

/**
 * Família: nome (só quem administra muda), como a família está configurada, pedidos de convite
 * (quem administra) e o histórico (de todos para quem administra; o seu para os membros).
 */
export default async function SettingsPage() {
  const auth = await requireAuth();
  const isAdmin = auth.role === "owner";
  const [members, lookups, log, requests, [house]] = await Promise.all([
    getMembers(auth.householdId),
    getLookupsFor(auth),
    getFamilyLog(auth, { size: 20 }),
    getInviteRequests(auth),
    getDb().select({ createdAt: schema.households.createdAt, approvalsFrom: schema.households.approvalsFrom }).from(schema.households).where(eq(schema.households.id, auth.householdId)),
  ]);
  const feed = await feedPage(auth, lookups, auth.currency, { audit: true, size: 20 });
  const [{ n: txCount }] = await getDb().select({ n: count() }).from(schema.transactions).where(eq(schema.transactions.householdId, auth.householdId));
  const hasTx = txCount > 0;
  const approvalsOn = !!house && house.approvalsFrom.getTime() < APPROVALS_OFF.getTime();
  const invite = (await getInvites(auth.householdId))[0] ?? null;
  return (
    <div className="grid">
      <CoupleCard
        meId={auth.userId}
        people={members.map((m) => {
          const pp = lookups.participants.find((x) => x.id === m.participantId);
          return { userId: m.userId, name: m.name, avatarUrl: pp?.avatarUrl ?? null, color: pp?.color ?? "#E07A5F" };
        })}
        invite={invite ? { id: invite.id, code: invite.code, expiresAt: invite.expiresAt.toISOString() } : null}
      />

      <HouseholdForm name={auth.householdName} currency={auth.currency} isOwner={isAdmin} currencyLocked={hasTx} approvals={approvalsOn} />

      <PeopleSections auth={auth} />

      <HistoryPanel
        isAdmin={isAdmin}
        family={{ rows: log.rows.map((x) => ({ id: x.id, when: x.createdAt.toISOString(), text: x.text })), next: log.next }}
        feed={{ rows: feed.items.map((x) => ({ id: x.id, when: x.when, actor: x.actor, text: x.text, detail: x.detail, href: x.href })), next: feed.next }}
        requests={requests}
      />

    </div>
  );
}
