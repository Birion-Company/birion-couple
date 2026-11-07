"use server";

import { randomBytes } from "node:crypto";
import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { requireAuth, requireOwner } from "@/lib/auth";
import { destroySession } from "@/lib/session";
import { redirect } from "next/navigation";

export type ActionResult = { ok: boolean; error?: string; message?: string };

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "Cor inválida." });
const label = (what: string) => z.string().trim().min(1, { error: `Dê um nome para ${what}.` }).max(60);

const done = (message?: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};
const fail = (error: string): ActionResult => ({ ok: false, error });
const firstIssue = (e: z.ZodError) => fail(e.issues[0].message);

// ---------- Família ----------

export async function updateHousehold(input: { name: string; currency: string }): Promise<ActionResult> {
  const auth = await requireOwner();
  const parsed = z.object({ name: label("a família"), currency: z.enum(["BRL", "USD", "EUR"]) }).safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  await getDb().update(schema.households).set(parsed.data).where(eq(schema.households.id, auth.householdId));
  return done("Família atualizada.");
}

/**
 * Apaga a família e todos os dados dela. Contas de login que não participam de outra família
 * também são apagadas. Exige digitar o nome da família para confirmar.
 */
export async function deleteHousehold(confirmName: string): Promise<ActionResult> {
  const auth = await requireOwner();
  if (confirmName.trim() !== auth.householdName.trim()) return fail("O nome digitado não confere.");
  const db = getDb();
  await db.transaction(async (tx) => {
    const members = await tx
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(eq(schema.memberships.householdId, auth.householdId));
    await tx.delete(schema.households).where(eq(schema.households.id, auth.householdId));
    for (const m of members) {
      const [{ n }] = await tx.select({ n: count() }).from(schema.memberships).where(eq(schema.memberships.userId, m.userId));
      if (n === 0) await tx.delete(schema.users).where(eq(schema.users.id, m.userId));
    }
  });
  await destroySession();
  redirect("/entrar");
}

// ---------- Listas configuráveis ----------

type ListKind = "participants" | "categories" | "projects" | "statuses";

const tables = {
  participants: schema.participants,
  categories: schema.categories,
  projects: schema.projects,
  statuses: schema.statuses,
} as const;

const shapes = {
  participants: z.object({ name: label("a pessoa"), color }),
  categories: z.object({ name: label("a categoria"), color }),
  projects: z.object({ name: label("o projeto"), color, description: z.string().trim().max(200).optional().nullable() }),
  statuses: z.object({
    name: label("o status"),
    color,
    behavior: z.enum(["pending", "open", "settled"]),
    isDefault: z.boolean(),
    isImportDefault: z.boolean(),
  }),
};

export async function saveListItem(kind: ListKind, id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const auth = await requireAuth();
  const parsed = shapes[kind].safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const db = getDb();
  const table = tables[kind];
  const data = parsed.data as Record<string, unknown>;

  await db.transaction(async (tx) => {
    // Só pode haver um status padrão para lançamentos e um para importações.
    if (kind === "statuses") {
      if (data.isDefault) await tx.update(schema.statuses).set({ isDefault: false }).where(eq(schema.statuses.householdId, auth.householdId));
      if (data.isImportDefault) await tx.update(schema.statuses).set({ isImportDefault: false }).where(eq(schema.statuses.householdId, auth.householdId));
    }
    if (id) {
      await tx.update(table).set(data).where(and(eq(table.id, id), eq(table.householdId, auth.householdId)));
    } else {
      const [{ n }] = await tx.select({ n: count() }).from(table).where(eq(table.householdId, auth.householdId));
      await tx.insert(table).values({ ...data, householdId: auth.householdId, ...("sortOrder" in table ? { sortOrder: n } : {}) } as never);
    }
  });
  return done(id ? "Salvo." : "Adicionado.");
}

export async function setArchived(kind: ListKind, id: string, archived: boolean): Promise<ActionResult> {
  const auth = await requireAuth();
  const table = tables[kind];
  await getDb().update(table).set({ archived }).where(and(eq(table.id, id), eq(table.householdId, auth.householdId)));
  return done(archived ? "Arquivado. Continua nos lançamentos antigos, mas some das opções." : "Reativado.");
}

/** Exclui só o que não está em uso; o resto deve ser arquivado para não apagar histórico. */
export async function deleteListItem(kind: ListKind, id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const db = getDb();
  const t = schema.transactions;
  const usage = {
    participants: async () => {
      const [a] = await db.select({ n: count() }).from(t).where(and(eq(t.householdId, auth.householdId), eq(t.payerId, id)));
      const [b] = await db.select({ n: count() }).from(schema.transactionSplits).where(eq(schema.transactionSplits.participantId, id));
      return a.n + b.n;
    },
    categories: async () => (await db.select({ n: count() }).from(t).where(and(eq(t.householdId, auth.householdId), eq(t.categoryId, id))))[0].n,
    projects: async () => (await db.select({ n: count() }).from(t).where(and(eq(t.householdId, auth.householdId), eq(t.projectId, id))))[0].n,
    statuses: async () => (await db.select({ n: count() }).from(t).where(and(eq(t.householdId, auth.householdId), eq(t.statusId, id))))[0].n,
  };
  const used = await usage[kind]();
  if (used > 0) return fail(`Está em uso em ${used} lançamento(s). Arquive em vez de excluir para manter o histórico.`);
  if (kind === "statuses") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.statuses)
      .where(and(eq(schema.statuses.householdId, auth.householdId), ne(schema.statuses.id, id)));
    if (n === 0) return fail("A família precisa ter pelo menos um status.");
  }
  if (kind === "participants") {
    await db
      .update(schema.memberships)
      .set({ participantId: null })
      .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.participantId, id)));
  }
  const table = tables[kind];
  await db.delete(table).where(and(eq(table.id, id), eq(table.householdId, auth.householdId)));
  return done("Excluído.");
}

// ---------- Regras de categoria ----------

export async function addRule(input: { pattern: string; categoryId: string }): Promise<ActionResult> {
  const auth = await requireAuth();
  const parsed = z
    .object({ pattern: z.string().trim().min(2, { error: "Digite pelo menos 2 letras." }).max(60), categoryId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const db = getDb();
  const [cat] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(and(eq(schema.categories.id, parsed.data.categoryId), eq(schema.categories.householdId, auth.householdId)));
  if (!cat) return fail("Categoria não encontrada.");
  await db.insert(schema.categoryRules).values({ ...parsed.data, householdId: auth.householdId });
  return done("Regra criada.");
}

export async function deleteRule(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  await getDb()
    .delete(schema.categoryRules)
    .where(and(eq(schema.categoryRules.id, id), eq(schema.categoryRules.householdId, auth.householdId)));
  return done("Regra removida.");
}

export async function deletePreset(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  await getDb().delete(schema.csvPresets).where(and(eq(schema.csvPresets.id, id), eq(schema.csvPresets.householdId, auth.householdId)));
  return done("Modelo removido.");
}

// ---------- Membros e convites ----------

export async function createInvite(role: "owner" | "member"): Promise<ActionResult & { code?: string }> {
  const auth = await requireOwner();
  const code = randomBytes(12).toString("base64url");
  await getDb()
    .insert(schema.invites)
    .values({
      householdId: auth.householdId,
      code,
      role: role === "owner" ? "owner" : "member",
      createdBy: auth.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
  revalidatePath("/ajustes");
  return { ok: true, code, message: "Convite criado. Vale por 7 dias e para uma pessoa." };
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const auth = await requireOwner();
  await getDb().delete(schema.invites).where(and(eq(schema.invites.id, id), eq(schema.invites.householdId, auth.householdId)));
  return done("Convite cancelado.");
}

export async function setMemberRole(userId: string, role: "owner" | "member"): Promise<ActionResult> {
  const auth = await requireOwner();
  const db = getDb();
  if (role === "member") {
    const owners = await db
      .select({ id: schema.memberships.userId })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.role, "owner")));
    if (owners.length === 1 && owners[0].id === userId) return fail("A família precisa de pelo menos uma pessoa administradora.");
  }
  await db
    .update(schema.memberships)
    .set({ role })
    .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.userId, userId)));
  return done("Permissão atualizada.");
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const auth = await requireOwner();
  if (userId === auth.userId) return fail("Você não pode remover a si mesmo.");
  await getDb()
    .delete(schema.memberships)
    .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.userId, userId)));
  return done("Acesso removido. A pessoa continua nos lançamentos como participante.");
}
