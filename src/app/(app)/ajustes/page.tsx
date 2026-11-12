import type { Metadata } from "next";
import { Users } from "lucide-react";
import { HouseholdForm } from "@/components/settings-panels";
import { FamilyOverview } from "@/components/family-overview";
import { HistoryPanel, InviteRequestsAdmin } from "@/components/family-panels";
import { feedPage } from "@/lib/activity";
import { requireAuth } from "@/lib/auth";
import { ADMINS_MAX, CONTACTS_ACTIVE_MAX, MEMBERS_MAX } from "@/lib/defaults";
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
    getDb().select({ createdAt: schema.households.createdAt }).from(schema.households).where(eq(schema.households.id, auth.householdId)),
  ]);
  const feed = await feedPage(auth, lookups, auth.currency, { audit: true, size: 20 });
  const [{ n: txCount }] = await getDb().select({ n: count() }).from(schema.transactions).where(eq(schema.transactions.householdId, auth.householdId));
  const hasTx = txCount > 0;
  const openInvites = isAdmin ? (await getInvites(auth.householdId)).length : 0;
  const admins = members.filter((m) => m.role === "owner");
  return (
    <div className="grid">
      <HouseholdForm name={auth.householdName} currency={auth.currency} isOwner={isAdmin} currencyLocked={hasTx} />

      <FamilyOverview
        people={members.map((m) => {
          const pp = lookups.participants.find((x) => x.id === m.participantId);
          return { userId: m.userId, name: m.name, username: m.username, role: m.role, avatarUrl: pp?.avatarUrl ?? null, color: pp?.color ?? "#1AC4DB" };
        })}
        meId={auth.userId}
        isAdmin={isAdmin}
        membersMax={MEMBERS_MAX}
        adminsMax={ADMINS_MAX}
        openInvites={openInvites}
        pendingRequests={requests.filter((r) => r.status === "pending").length}
        createdAt={house ? house.createdAt.toLocaleDateString("pt-BR") : ""}
        currency={auth.currency}
      />

      {isAdmin && (
        <div id="pedidos">
          <InviteRequestsAdmin requests={requests} />
        </div>
      )}

      <HistoryPanel
        isAdmin={isAdmin}
        family={{ rows: log.rows.map((x) => ({ id: x.id, when: x.createdAt.toISOString(), text: x.text })), next: log.next }}
        feed={{ rows: feed.items.map((x) => ({ id: x.id, when: x.when, actor: x.actor, text: x.text, detail: x.detail, href: x.href })), next: feed.next }}
        requests={requests}
      />

    </div>
  );
}
