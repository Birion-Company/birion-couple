import type { Metadata } from "next";
import { MembersPanel } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";
import { getInvites, getLookups, getMembers } from "@/lib/queries";

export const metadata: Metadata = { title: "Acesso" };

export default async function MembersPage() {
  const auth = await requireAuth();
  const [members, invites, { participants }] = await Promise.all([
    getMembers(auth.householdId),
    auth.role === "owner" ? getInvites(auth.householdId) : Promise.resolve([]),
    getLookups(auth.householdId, auth.userId),
  ]);
  return (
    <MembersPanel
      members={members}
      invites={invites.map((i) => ({ id: i.id, code: i.code, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
      participants={participants}
      me={auth.userId}
      isOwner={auth.role === "owner"}
    />
  );
}
