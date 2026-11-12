"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getAuth, getHomeless } from "@/lib/auth";
import { hasRoomForMember } from "@/lib/household";
import { createSession, readSession } from "@/lib/session";
import { findInvite } from "@/lib/invites";
import { leaveHousehold } from "@/lib/leave";
import { logFamily } from "@/lib/family-log";
import { ADMINS_MAX, MEMBERS_MAX } from "@/lib/defaults";

export type InviteResult = { ok: false; error: string } | undefined;

/**
 * Aceitar o convite já logado (tela "Fulano te convidou para a família X"). A conta passa para a família
 * nova como pessoa com login; na antiga, vira pessoa sem login (o que ele lançou lá continua lá).
 */
export async function acceptInviteLoggedIn(code: string): Promise<InviteResult> {
  const session = await readSession();
  const auth = await getAuth();
  const homeless = auth ? null : await getHomeless();
  const userId = auth?.userId ?? homeless?.userId ?? null;
  if (!session || !userId) redirect(`/entrar?convite=${encodeURIComponent(code)}`);
  const [acc] = await getDb().select({ at: schema.users.emailVerifiedAt }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!acc?.at) redirect(`/verificar-email?convite=${encodeURIComponent(code)}`);
  const invite = await findInvite(code);
  if (!invite) return { ok: false, error: "Este convite não vale mais. Peça um novo para quem administra a família." };
  const db = getDb();
  const m = schema.memberships;
  const [already] = await db.select({ userId: m.userId }).from(m).where(and(eq(m.userId, userId), eq(m.householdId, invite.householdId))).limit(1);
  if (!already && !(await hasRoomForMember(db, invite.householdId))) {
    return { ok: false, error: `Esta família já está no limite de ${MEMBERS_MAX} pessoas com login.` };
  }
  const [user] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const claimed = await db.transaction(async (tx) => {
    // Convite vale para uma pessoa só: quem usar primeiro "pega" (outra pessoa ao mesmo tempo não entra).
    const got = await tx
      .update(schema.invites)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.invites.id, invite.id), isNull(schema.invites.usedAt)))
      .returning({ id: schema.invites.id });
    if (got.length === 0) return false;
    if (!already) {
      // Sai das outras famílias (a pessoa dele lá vira "sem login").
      const others = await tx.select({ hid: m.householdId }).from(m).where(and(eq(m.userId, userId), ne(m.householdId, invite.householdId)));
      for (const o of others) await leaveHousehold(tx, userId, o.hid);
      // Convite feito a partir de um contato: a conta assume essa pessoa (com o histórico e as dívidas dela).
      const [contact] = invite.participantId
        ? await tx
            .select({ id: schema.participants.id })
            .from(schema.participants)
            .where(
              and(
                eq(schema.participants.id, invite.participantId),
                eq(schema.participants.householdId, invite.householdId),
                sql`not exists (select 1 from "memberships" mm where mm."participantId" = ${schema.participants.id})`,
              ),
            )
        : [];
      let participantId = contact?.id;
      if (participantId) {
        await tx.update(schema.participants).set({ archived: false, temporary: false }).where(eq(schema.participants.id, participantId));
      } else {
        const [p] = await tx
          .insert(schema.participants)
          .values({ householdId: invite.householdId, name: user?.name ?? "Pessoa", color: "#A77BDB", sortOrder: 99 })
          .returning({ id: schema.participants.id });
        participantId = p.id;
      }
      // Convite de administrador com a administração cheia: entra como membro.
      const [{ admins }] = await tx
        .select({ admins: sql<number>`count(*)::int` })
        .from(m)
        .where(and(eq(m.householdId, invite.householdId), eq(m.role, "owner")));
      const role = invite.role === "owner" && admins < ADMINS_MAX ? "owner" : "member";
      await tx.insert(m).values({ householdId: invite.householdId, userId, role, participantId });
      await logFamily(tx, {
        householdId: invite.householdId,
        actorUserId: userId,
        actorName: user?.name ?? "Alguém",
        subjectUserId: userId,
        action: "joined",
        text: `${user?.name ?? "Alguém"} entrou na família${role === "owner" ? " como administrador" : ""}.`,
      });
    }
    return true;
  });
  if (!claimed) return { ok: false, error: "Este convite já foi usado por outra pessoa. Peça um novo." };
  await createSession({ uid: userId, hid: invite.householdId });
  redirect("/painel?bemvindo=1");
}
