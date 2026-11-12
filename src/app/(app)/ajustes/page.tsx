import type { Metadata } from "next";
import { Users } from "lucide-react";
import { DangerZone, HouseholdForm } from "@/components/settings-panels";
import { HistoryPanel, InviteRequestsAdmin } from "@/components/family-panels";
import { feedPage } from "@/lib/activity";
import { requireAuth } from "@/lib/auth";
import { ADMINS_MAX, CONTACTS_ACTIVE_MAX, MEMBERS_MAX } from "@/lib/defaults";
import { getFamilyLog, getInviteRequests } from "@/lib/family-log";
import { getLookupsFor, getMembers } from "@/lib/queries";
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
  const admins = members.filter((m) => m.role === "owner");
  return (
    <div className="grid">
      <HouseholdForm name={auth.householdName} currency={auth.currency} isOwner={isAdmin} currencyLocked={hasTx} />

      <section className="card section family-facts" aria-labelledby="como-esta">
        <h2 id="como-esta">
          <Users size={17} strokeWidth={1.9} aria-hidden /> Como a família está
        </h2>
        <dl>
          <div>
            <dt>Pessoas com login</dt>
            <dd>
              {members.length} de {MEMBERS_MAX}
            </dd>
          </div>
          <div>
            <dt>Administram ({admins.length} de {ADMINS_MAX})</dt>
            <dd>{admins.map((a) => a.name.split(" ")[0]).join(", ")}</dd>
          </div>
          <div>
            <dt>Você</dt>
            <dd>{isAdmin ? "administra: vê e altera tudo" : "membro: vê o que envolve você"}</dd>
          </div>
          <div>
            <dt>Moeda</dt>
            <dd>{auth.currency}</dd>
          </div>
          <div>
            <dt>Contatos sem login</dt>
            <dd>de cada pessoa, até {CONTACTS_ACTIVE_MAX} ativos</dd>
          </div>
          {house && (
            <div>
              <dt>Criada em</dt>
              <dd>{house.createdAt.toLocaleDateString("pt-BR")}</dd>
            </div>
          )}
        </dl>
      </section>

      {isAdmin && <InviteRequestsAdmin requests={requests} />}

      <HistoryPanel
        isAdmin={isAdmin}
        family={{ rows: log.rows.map((x) => ({ id: x.id, when: x.createdAt.toISOString(), text: x.text })), next: log.next }}
        feed={{ rows: feed.items.map((x) => ({ id: x.id, when: x.when, actor: x.actor, text: x.text, detail: x.detail, href: x.href })), next: feed.next }}
        requests={requests}
      />

      {/* Qualquer pessoa pode apagar o que é só dela ou a própria conta (não existe mais "excluir a família"). */}
      <DangerZone />
    </div>
  );
}
