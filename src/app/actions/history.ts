"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { feedPage } from "@/lib/activity";
import { getAuditor, requireAuth } from "@/lib/auth";
import { getFamilyLog } from "@/lib/family-log";
import { getLookups } from "@/lib/queries";

/**
 * Páginas do histórico (busca e "Ver mais" no servidor, sem teto fixo). Cada chamada devolve uma página e `next`
 * (de onde pedir a seguinte; nulo = acabou). O que cada pessoa pode ver segue as mesmas regras das telas.
 */
export type FeedRow = { id: string; when: string; actor: string; text: string; detail: string | null; href: string | null };
type Page<T> = { rows: T[]; next: string | null };
const clean = (q?: string) => (q ?? "").trim().slice(0, 80);
const cursor = (b?: string | null) => (b && !Number.isNaN(Date.parse(b)) ? b : null);

/** Histórico da família (entrou, saiu, convites, administradores…). */
export async function loadFamilyLog(input: { before?: string | null; q?: string }): Promise<Page<{ id: string; when: string; text: string }>> {
  const auth = await requireAuth();
  const r = await getFamilyLog(auth, { size: 20, before: cursor(input.before), q: clean(input.q) });
  return { rows: r.rows.map((x) => ({ id: x.id, when: x.createdAt.toISOString(), text: x.text })), next: r.next };
}

/** Histórico dos lançamentos (o que cada um fez). */
export async function loadFeed(input: { before?: string | null; q?: string }): Promise<Page<FeedRow>> {
  const auth = await requireAuth();
  const lookups = await getLookups(auth.householdId, auth.userId);
  const r = await feedPage(auth, lookups, auth.currency, { audit: true, before: cursor(input.before), q: clean(input.q) });
  return { rows: r.items.map((x) => ({ id: x.id, when: x.when, actor: x.actor, text: x.text, detail: x.detail, href: x.href })), next: r.next };
}

/** Auditoria: o histórico de uma família (só a conta de auditoria). */
export async function loadAuditFeed(input: { householdId: string; before?: string | null; q?: string }): Promise<Page<FeedRow>> {
  const auditor = await getAuditor();
  if (!auditor || !/^[0-9a-f-]{36}$/.test(input.householdId)) return { rows: [], next: null };
  const [house] = await getDb().select({ currency: schema.households.currency }).from(schema.households).where(eq(schema.households.id, input.householdId)).limit(1);
  if (!house) return { rows: [], next: null };
  const lookups = await getLookups(input.householdId);
  const viewer = { householdId: input.householdId, userId: auditor.userId, participantId: null, role: "owner" as const, all: true };
  const r = await feedPage(viewer, lookups, house.currency, { audit: true, before: cursor(input.before), q: clean(input.q) });
  return { rows: r.items.map((x) => ({ id: x.id, when: x.when, actor: x.actor, text: x.text, detail: x.detail, href: null })), next: r.next };
}
