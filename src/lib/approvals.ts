import "server-only";
import { cache } from "react";
import { and, eq, inArray, isNotNull, min, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * "Para confirmar": um lançamento que envolve outro membro (com login) só passa a valer nas dívidas
 * depois que ele aceita. Quem lançou não precisa aceitar o próprio lançamento; contatos (sem login)
 * não confirmam nada. Parcelas e meses de uma série valem juntos (aceitar uma aceita a série).
 *
 * O aceite guarda um "retrato" do que foi aceito (tipo, valor, quem pagou e a divisão). Se quem
 * lançou mudar algo disso, o retrato não bate e o lançamento volta a esperar a confirmação.
 * Mudar descrição, categoria, data ou observações não pede confirmação de novo.
 */

export type ApprovalInput = {
  id: string;
  seriesId: string | null;
  kind: string;
  payerId: string | null;
  amountCents: number;
  createdBy: string | null;
  createdAt: Date;
  splits: { participantId: string; amountCents: number }[];
};

export type ApprovalState = {
  /** Participante de quem lançou (nulo: lançamento automático ou de quem saiu da família). */
  creatorId: string | null;
  /** Membros que ainda não aceitaram. */
  waiting: string[];
  /** Membros que recusaram (com o motivo, se deram). */
  refused: { id: string; reason: string | null }[];
};

const t = schema.transactions;

/** O que um membro aceita: série inteira (sem valores, que mudam de parcela a parcela) ou um lançamento. */
export function approvalKey(r: Pick<ApprovalInput, "id" | "seriesId">) {
  return r.seriesId ?? r.id;
}
export function fingerprint(r: ApprovalInput) {
  const people = [...r.splits].sort((a, b) => a.participantId.localeCompare(b.participantId));
  if (r.seriesId) return [r.kind, r.payerId ?? "", people.map((s) => s.participantId).join(",")].join("|");
  return [r.kind, r.payerId ?? "", r.amountCents, people.map((s) => `${s.participantId}:${s.amountCents}`).join(",")].join("|");
}

/** Membros da família (participante ↔ usuário) e desde quando vale a confirmação. Uma vez por requisição. */
export const approvalContext = cache(async (householdId: string) => {
  const db = getDb();
  const [members, [house]] = await Promise.all([
    db
      .select({ userId: schema.memberships.userId, participantId: schema.memberships.participantId })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.householdId, householdId), isNotNull(schema.memberships.participantId))),
    db.select({ from: schema.households.approvalsFrom }).from(schema.households).where(eq(schema.households.id, householdId)),
  ]);
  return {
    participantOf: new Map(members.map((m) => [m.userId, m.participantId!])),
    members: new Set(members.map((m) => m.participantId!)),
    from: house?.from ?? new Date(0),
  };
});

/** Situação da confirmação de cada lançamento (só aparecem os que envolvem alguém além de quem lançou). */
export async function approvalStates(householdId: string, rows: ApprovalInput[]): Promise<Map<string, ApprovalState>> {
  const out = new Map<string, ApprovalState>();
  if (rows.length === 0) return out;
  const ctx = await approvalContext(householdId);
  const db = getDb();

  // Quem precisa aceitar cada lançamento.
  const need = new Map<string, { row: ApprovalInput; creatorId: string | null; members: string[] }>();
  for (const r of rows) {
    const creatorId = r.createdBy ? ctx.participantOf.get(r.createdBy) ?? null : null;
    // Lançamento automático (sem quem lançou): ninguém impôs nada.
    if (!r.createdBy) continue;
    const members = [...new Set([r.payerId, ...r.splits.filter((s) => s.amountCents > 0).map((s) => s.participantId)])].filter(
      (p): p is string => !!p && p !== creatorId && ctx.members.has(p),
    );
    if (members.length) need.set(r.id, { row: r, creatorId, members });
  }
  if (need.size === 0) return out;

  // Lançado antes de existir a confirmação (a série conta pela primeira parcela): vale como aceito.
  const seriesIds = [...new Set([...need.values()].map((n) => n.row.seriesId).filter((x): x is string => !!x))];
  const seriesStart = new Map<string, Date>();
  for (let i = 0; i < seriesIds.length; i += 500) {
    const part = seriesIds.slice(i, i + 500);
    const found = await db
      .select({ seriesId: t.seriesId, first: min(t.createdAt) })
      .from(t)
      .where(and(eq(t.householdId, householdId), inArray(t.seriesId, part)))
      .groupBy(t.seriesId);
    for (const f of found) if (f.seriesId && f.first) seriesStart.set(f.seriesId, f.first);
    // Séries "todo mês" sem fim: o modelo guardado diz quando começou.
    const recs = await db
      .select({ id: schema.recurringSeries.id, createdAt: schema.recurringSeries.createdAt })
      .from(schema.recurringSeries)
      .where(and(eq(schema.recurringSeries.householdId, householdId), inArray(schema.recurringSeries.id, part)));
    for (const r of recs) {
      const cur = seriesStart.get(r.id);
      if (!cur || r.createdAt < cur) seriesStart.set(r.id, r.createdAt);
    }
  }
  for (const [id, n] of need) {
    const started = n.row.seriesId ? seriesStart.get(n.row.seriesId) ?? n.row.createdAt : n.row.createdAt;
    if (started < ctx.from) need.delete(id);
  }
  if (need.size === 0) return out;

  const keys = [...new Set([...need.values()].map((n) => approvalKey(n.row)))];
  const decided = new Map<string, { status: string; fingerprint: string; reason: string | null }>();
  for (let i = 0; i < keys.length; i += 500) {
    const found = await db
      .select()
      .from(schema.txApprovals)
      .where(and(eq(schema.txApprovals.householdId, householdId), inArray(schema.txApprovals.key, keys.slice(i, i + 500))));
    for (const a of found) decided.set(`${a.key}:${a.participantId}`, a);
  }
  for (const [id, n] of need) {
    const fp = fingerprint(n.row);
    const key = approvalKey(n.row);
    const state: ApprovalState = { creatorId: n.creatorId, waiting: [], refused: [] };
    for (const p of n.members) {
      const d = decided.get(`${key}:${p}`);
      if (d && d.fingerprint === fp && d.status === "accepted") continue;
      if (d && d.fingerprint === fp && d.status === "refused") state.refused.push({ id: p, reason: d.reason });
      else state.waiting.push(p);
    }
    if (state.waiting.length || state.refused.length) out.set(id, state);
  }
  return out;
}

/** Grava a decisão de um membro (aceitar ou recusar) sobre o que está no lançamento agora. */
export async function saveDecision(householdId: string, row: ApprovalInput, participantId: string, status: "accepted" | "refused", reason: string | null) {
  await getDb()
    .insert(schema.txApprovals)
    .values({ householdId, key: approvalKey(row), participantId, status, fingerprint: fingerprint(row), reason })
    .onConflictDoUpdate({
      target: [schema.txApprovals.key, schema.txApprovals.participantId],
      set: { status, fingerprint: fingerprint(row), reason, decidedAt: sql`now()` },
    });
}
