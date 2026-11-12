import type { Metadata } from "next";
import { MembersPanel } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";
import { getInvites, getLookups, getMembers } from "@/lib/queries";
import { RequestInvitePanel } from "@/components/family-panels";
import { getInviteRequests } from "@/lib/family-log";

export const metadata: Metadata = { title: "Acesso" };

export default async function MembersPage() {
  const auth = await requireAuth();
  const [members, invites, { participants }, requests] = await Promise.all([
    getMembers(auth.householdId),
    auth.role === "owner" ? getInvites(auth.householdId) : Promise.resolve([]),
    getLookups(auth.householdId, auth.userId),
    auth.role === "owner" ? Promise.resolve([]) : getInviteRequests(auth),
  ]);
  return (
    <>
    {/* Membro não gera convite: pede para quem administra. */}
    {auth.role !== "owner" && <RequestInvitePanel requests={requests} />}
    <MembersPanel
      members={members}
      invites={invites.map((i) => ({ id: i.id, code: i.code, role: i.role, expiresAt: i.expiresAt.toISOString(), label: i.label }))}
      participants={participants}
      me={auth.userId}
      isOwner={auth.role === "owner"}
    />
    </>
  );
}
