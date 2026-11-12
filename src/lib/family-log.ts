import "server-only";
import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Tx } from "./leave";

type Db = ReturnType<typeof getDb> | Tx;

/** Escreve uma linha no registro da família. */
export async function logFamily(
  db: Db,
  e: { householdId: string; actorUserId: string | null; actorName: string; action: string; text: string; subjectUserId?: string | null },
) {
  await db.insert(schema.familyLog).values({ ...e, subjectUserId: e.subjectUserId ?? null });
}

/**
 * Registro visível para a pessoa: quem administra vê tudo; membro vê o que fez ou o que foi com ele.
 * Em páginas: `before` (data do último item da página anterior) e `q` (busca no texto, feita no banco).
 */
export async function getFamilyLog(
  v: { householdId: string; userId: string; role: string },
  { size = 20, before, q }: { size?: number; before?: string | null; q?: string } = {},
) {
  const L = schema.familyLog;
  const rows = await getDb()
    .select({ id: L.id, action: L.action, text: L.text, actorName: L.actorName, createdAt: L.createdAt })
    .from(L)
    .where(
      and(
        eq(L.householdId, v.householdId),
        v.role === "owner" ? undefined : or(eq(L.actorUserId, v.userId), eq(L.subjectUserId, v.userId)),
        before ? lt(L.createdAt, new Date(before)) : undefined,
        q?.trim() ? ilike(L.text, `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined,
      ),
    )
    .orderBy(desc(L.createdAt), desc(L.id))
    .limit(size + 1);
  const page = rows.slice(0, size);
  return { rows: page, next: rows.length > size ? page[page.length - 1].createdAt.toISOString() : null };
}

export type InviteRequestRow = {
  id: string;
  forName: string;
  status: string;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  requester: string;
  requestedBy: string;
  /** Link liberado (pedido aceito e convite ainda não usado nem vencido). */
  code: string | null;
  used: boolean;
};

/** Pedidos de convite: quem administra vê todos; membro vê só os dele. */
export async function getInviteRequests(v: { householdId: string; userId: string; role: string }): Promise<InviteRequestRow[]> {
  const R = schema.inviteRequests;
  const I = schema.invites;
  const rows = await getDb()
    .select({
      id: R.id,
      forName: R.forName,
      status: R.status,
      reason: R.reason,
      createdAt: R.createdAt,
      decidedAt: R.decidedAt,
      requester: schema.users.name,
      requestedBy: R.requestedBy,
      code: I.code,
      usedAt: I.usedAt,
      expiresAt: I.expiresAt,
    })
    .from(R)
    .innerJoin(schema.users, eq(schema.users.id, R.requestedBy))
    .leftJoin(I, eq(I.id, R.inviteId))
    .where(and(eq(R.householdId, v.householdId), v.role === "owner" ? undefined : eq(R.requestedBy, v.userId)))
    .orderBy(desc(R.createdAt))
    .limit(100);
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    forName: r.forName,
    status: r.status,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    requester: r.requester,
    requestedBy: r.requestedBy,
    code: r.code && !r.usedAt && r.expiresAt && r.expiresAt.getTime() > now ? r.code : null,
    used: !!r.usedAt,
  }));
}
