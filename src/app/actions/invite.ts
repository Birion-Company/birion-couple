"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getAuth, getHomeless } from "@/lib/auth";
import { hasRoomForMember } from "@/lib/household";
import { createSession, readSession } from "@/lib/session";
import { findInvite } from "@/lib/invites";
import { bringHomeInto, MergeBlocked } from "@/lib/merge-household";
import { logFamily } from "@/lib/family-log";
import { MEMBERS_MAX } from "@/lib/defaults";
import { insertReturning, updateReturning } from "@/db/ops";

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
  if (!invite) return { ok: false, error: "Este convite não vale mais. Peça um novo para o seu par." };
  const db = getDb();
  const m = schema.memberships;
  const [already] = await db.select({ userId: m.userId }).from(m).where(and(eq(m.userId, userId), eq(m.householdId, invite.householdId))).limit(1);
  if (!already && !(await hasRoomForMember(db, invite.householdId))) {
    return { ok: false, error: `Este casal já está no limite de ${MEMBERS_MAX} pessoas com login.` };
  }
  const [user] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  let blocked: string | null = null;
  const claimed = await db.transaction(async (tx) => {
    // Convite vale para uma pessoa só: quem usar primeiro "pega" (outra pessoa ao mesmo tempo não entra).
    const got = await updateReturning(tx, schema.invites, { usedAt: new Date() }, and(eq(schema.invites.id, invite.id), isNull(schema.invites.usedAt)), { id: schema.invites.id });
    if (got.length === 0) return false;
    if (!already) {
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
      // Nunca perder dados: o que a pessoa tinha na própria família vem junto para o casal.
      const others = await tx.select({ hid: m.householdId }).from(m).where(and(eq(m.userId, userId), ne(m.householdId, invite.householdId)));
      let broughtPid = "";
      for (const o of others) broughtPid = (await bringHomeInto(tx, { userId, fromHid: o.hid, toHid: invite.householdId, claimedPid: contact?.id ?? null })) || broughtPid;
      let participantId = contact?.id ?? (broughtPid || undefined);
      if (participantId) {
        await tx.update(schema.participants).set({ archived: false, temporary: false }).where(eq(schema.participants.id, participantId));
      } else {
        const [p] = await insertReturning(tx, schema.participants, { householdId: invite.householdId, name: user?.name ?? "Pessoa", color: "#6F9C7C", sortOrder: 99 }, { id: schema.participants.id });
        participantId = p.id;
      }
      // No casal as duas pessoas têm o mesmo poder.
      const role = "owner";
      await tx.insert(m).values({ householdId: invite.householdId, userId, role, participantId });
      await logFamily(tx, {
        householdId: invite.householdId,
        actorUserId: userId,
        actorName: user?.name ?? "Alguém",
        subjectUserId: userId,
        action: "joined",
        text: `${user?.name ?? "Alguém"} entrou no casal.`,
      });
    }
    return true;
  }).catch((e) => {
    if (e instanceof MergeBlocked) {
      blocked = e.message;
      return false;
    }
    throw e;
  });
  if (blocked) return { ok: false, error: blocked };
  if (!claimed) return { ok: false, error: "Este convite já foi usado por outra pessoa. Peça um novo." };
  await createSession({ uid: userId, hid: invite.householdId });
  redirect("/painel?bemvindo=1");
}
