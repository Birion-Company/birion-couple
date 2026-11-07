import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gte, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { AuthHeader } from "@/components/auth/auth-header";
import { InviteForm } from "@/components/auth/invite-form";

export const metadata: Metadata = { title: "Convite" };

export default async function InvitePage({ params }: PageProps<"/convite/[code]">) {
  const { code } = await params;
  const [invite] = await getDb()
    .select({ household: schema.households.name })
    .from(schema.invites)
    .innerJoin(schema.households, eq(schema.households.id, schema.invites.householdId))
    .where(and(eq(schema.invites.code, code), isNull(schema.invites.usedAt), gte(schema.invites.expiresAt, new Date())))
    .limit(1);
  if (!invite) {
    return (
      <>
        <AuthHeader title="Convite inválido" subtitle="Este link expirou ou já foi usado. Peça um novo para quem administra a família." />
        <p className="auth-bottom"><Link href="/entrar">Ir para a entrada</Link></p>
      </>
    );
  }
  return (
    <InviteForm code={code} household={invite.household} />
  );
}
