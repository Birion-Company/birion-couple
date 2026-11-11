import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { findInvite } from "@/lib/invites";
import { AuthHeader } from "@/components/auth/auth-header";
import { InviteAccept } from "@/components/auth/invite-accept";
import { getAuth, getHomeless } from "@/lib/auth";

export const metadata: Metadata = { title: "Convite" };

export default async function InvitePage({ params }: PageProps<"/convite/[code]">) {
  const { code } = await params;
  const invite = await findInvite(code);
  if (!invite) {
    return (
      <>
        <AuthHeader title="Convite inválido" subtitle="Este link expirou ou já foi usado. Peça um novo para quem administra a família." />
        <p className="auth-bottom">
          <Link href="/entrar">Ir para a entrada</Link>
        </p>
      </>
    );
  }
  const db = getDb();
  const [inviter] = invite.createdBy
    ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, invite.createdBy)).limit(1)
    : [];
  // Logado: aceitar direto. Deslogado: entrar ou criar conta e voltar aqui.
  const auth = await getAuth();
  const homeless = auth ? null : await getHomeless();
  const userId = auth?.userId ?? homeless?.userId ?? null;
  const [member] = userId
    ? await db
        .select({ hid: schema.memberships.householdId })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.householdId, invite.householdId)))
        .limit(1)
    : [];
  const current = auth ? { name: auth.userName, household: auth.householdName } : homeless ? { name: homeless.name, household: null } : null;
  return <InviteAccept code={code} household={invite.household} inviter={inviter?.name ?? null} current={current} alreadyMember={!!member} />;
}
