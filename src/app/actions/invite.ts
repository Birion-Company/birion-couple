"use server";

import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getAuth, getHomeless } from "@/lib/auth";
import { MEMBERS_MAX } from "@/lib/defaults";
import { hasRoomForMember } from "@/lib/household";
import { createSession, readSession } from "@/lib/session";
import { findInvite } from "@/lib/invites";

export type InviteResult = { ok: false; error: string } | undefined;

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Sai de uma família ao entrar em outra:
 * - a pessoa dele lá continua (com todos os lançamentos e dívidas), mas vira "sem login" (sem ligação com a conta);
 * - se ele administrava, o cargo passa para quem entrou primeiro entre os que ficam;
 * - se a família fica sem ninguém e sem nenhum lançamento (ex.: a criada junto com a conta), ela é apagada.
 */
async function leaveHousehold(tx: Tx, userId: string, householdId: string) {
  const m = schema.memberships;
  const [mine] = await tx.select().from(m).where(and(eq(m.userId, userId), eq(m.householdId, householdId))).limit(1);
  if (!mine) return;
  await tx.delete(m).where(and(eq(m.userId, userId), eq(m.householdId, householdId)));
  const rest = await tx.select({ userId: m.userId, role: m.role }).from(m).where(eq(m.householdId, householdId)).orderBy(asc(m.createdAt));
  if (mine.role === "owner" && rest.length > 0 && !rest.some((r) => r.role === "owner")) {
    await tx.update(m).set({ role: "owner" }).where(and(eq(m.userId, rest[0].userId), eq(m.householdId, householdId)));
  }
  if (rest.length === 0) {
    const [{ n }] = await tx.select({ n: count() }).from(schema.transactions).where(eq(schema.transactions.householdId, householdId));
    if (n === 0) await tx.delete(schema.households).where(eq(schema.households.id, householdId));
  }
}

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
  await db.transaction(async (tx) => {
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
      await tx.insert(m).values({ householdId: invite.householdId, userId, role: invite.role, participantId });
    }
    await tx.update(schema.invites).set({ usedAt: new Date() }).where(eq(schema.invites.id, invite.id));
  });
  await createSession({ uid: userId, hid: invite.householdId });
  redirect("/painel?bemvindo=1");
}
