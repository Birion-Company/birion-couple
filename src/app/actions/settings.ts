"use server";

import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { canEditTx } from "@/lib/access";
import { involved, logActivity, snapshots } from "@/lib/activity";
import { requireAuth, requireOwner, type AuthContext } from "@/lib/auth";
import { ruleMatches } from "@/lib/rules-server";
import { findOrCreateContact, hasRoomForContact } from "@/lib/contacts";
import { ICON_KEYS } from "@/lib/category-icons";
import { HOUSEHOLD_NAME_MAX, MEMBERS_FULL_MESSAGE } from "@/lib/defaults";
import { hasRoomForMember } from "@/lib/household";
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
  const parsed = z
    .object({
      name: z
        .string()
        .trim()
        .min(1, { error: "Dê um nome para a família." })
        .max(HOUSEHOLD_NAME_MAX, { error: `O nome da família pode ter até ${HOUSEHOLD_NAME_MAX} caracteres.` }),
      currency: z.enum(["BRL", "USD", "EUR"]),
    })
    .safeParse(input);
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
  categories: z.object({ name: label("a categoria"), color, icon: z.enum(ICON_KEYS).optional() }),
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
  // Pessoa nova criada aqui é um contato (sem login): respeita o limite de contatos.
  if (kind === "participants" && !id) {
    const full = await hasRoomForContact(auth.householdId, { creating: true });
    if (full) return fail(full);
  }

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
  if (kind === "participants" && !archived) {
    const full = await hasRoomForContact(auth.householdId);
    if (full) return fail(full);
  }
  await getDb().update(table).set({ archived }).where(and(eq(table.id, id), eq(table.householdId, auth.householdId)));
  if (kind === "participants") return done(archived ? "Escondido. Volta ao digitar o nome num lançamento." : "Voltou para as listas.");
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
  if (used > 0) return fail(`Em uso em ${used} lançamento(s). Arquive em vez de excluir.`);
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
  const r = await applyRuleNow(auth, parsed.data.pattern, parsed.data.categoryId);
  return done(`Regra criada. ${r}`);
}

/** Aplica de novo uma regra que já existe em todos os lançamentos que batem com ela. */
export async function applyRule(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const [rule] = await getDb()
    .select({ pattern: schema.categoryRules.pattern, categoryId: schema.categoryRules.categoryId })
    .from(schema.categoryRules)
    .where(and(eq(schema.categoryRules.id, id), eq(schema.categoryRules.householdId, auth.householdId)));
  if (!rule) return fail("Regra não encontrada.");
  return done(await applyRuleNow(auth, rule.pattern, rule.categoryId));
}

/** Passa para a categoria da regra todos os lançamentos (que a pessoa pode editar) cuja descrição contém o texto. */
async function applyRuleNow(auth: AuthContext, pattern: string, categoryId: string): Promise<string> {
  const db = getDb();
  const all = await ruleMatches(auth.householdId, pattern, categoryId);
  const rows = all.filter((r) => canEditTx(auth, r.createdBy));
  const blocked = all.length - rows.length;
  const tail = blocked ? ` ${blocked} de outras pessoas ficaram como estavam.` : "";
  if (rows.length === 0) return `Nenhum lançamento para mudar agora.${tail}`;
  const ids = rows.map((r) => r.id);
  const snaps = await snapshots(db, auth.householdId, ids);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.transactions)
      .set({ categoryId, updatedAt: new Date() })
      .where(and(eq(schema.transactions.householdId, auth.householdId), inArray(schema.transactions.id, ids)));
    const items = [...snaps].map(([, x]) => ({ d: x.description, a: involved(x) }));
    await logActivity(tx, auth, { action: "bulk", data: { items, fields: ["categoria"] }, audience: items.flatMap((i) => i.a) });
  });
  const n = rows.length;
  return `${n} ${n === 1 ? "lançamento mudou" : "lançamentos mudaram"} de categoria.${tail}`;
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

export async function createInvite(role: "owner" | "member", participantId: string | null = null): Promise<ActionResult & { code?: string }> {
  const auth = await requireOwner();
  if (!(await hasRoomForMember(getDb(), auth.householdId))) return fail(MEMBERS_FULL_MESSAGE);
  // Convite de um contato: a conta nova fica ligada a ele (só se for mesmo um contato desta família, sem login).
  if (participantId) {
    const [ok] = await getDb()
      .select({ id: schema.participants.id })
      .from(schema.participants)
      .where(
        and(
          eq(schema.participants.id, participantId),
          eq(schema.participants.householdId, auth.householdId),
          sql`not exists (select 1 from "memberships" m where m."participantId" = ${schema.participants.id})`,
        ),
      );
    if (!ok) return fail("Essa pessoa já tem login ou não é desta família.");
  }
  const code = randomBytes(12).toString("base64url");
  await getDb()
    .insert(schema.invites)
    .values({
      householdId: auth.householdId,
      code,
      role: role === "owner" ? "owner" : "member",
      participantId,
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

// ---------- Ordem das categorias ----------

/** Grava a ordem das categorias (a mesma das listas de escolha nos lançamentos). */
export async function reorderCategories(ids: string[]): Promise<ActionResult> {
  const auth = await requireAuth();
  const parsed = z.array(z.uuid()).max(500).safeParse(ids);
  if (!parsed.success) return fail("Ordem inválida.");
  const db = getDb();
  const c = schema.categories;
  const mine = await db.select({ id: c.id }).from(c).where(eq(c.householdId, auth.householdId));
  const known = new Set(mine.map((x) => x.id));
  // As que não vieram na lista (ex.: arquivadas escondidas) vão para o fim, na ordem de antes.
  const order = [...parsed.data.filter((id) => known.has(id)), ...mine.map((x) => x.id).filter((id) => !parsed.data.includes(id))];
  await db.transaction(async (tx) => {
    for (const [i, id] of order.entries()) await tx.update(c).set({ sortOrder: i }).where(and(eq(c.id, id), eq(c.householdId, auth.householdId)));
  });
  return done("Ordem salva.");
}

/** Põe primeiro as categorias com mais despesas nos últimos 12 meses. */
export async function sortCategoriesByUse(): Promise<ActionResult> {
  const auth = await requireAuth();
  const db = getDb();
  const c = schema.categories;
  const t = schema.transactions;
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const used = await db
    .select({ id: t.categoryId, n: count() })
    .from(t)
    .where(and(eq(t.householdId, auth.householdId), eq(t.kind, "expense"), gte(t.date, since.toISOString().slice(0, 10)), isNotNull(t.categoryId)))
    .groupBy(t.categoryId);
  const uses = new Map(used.map((u) => [u.id, u.n]));
  const cats = await db.select({ id: c.id, sortOrder: c.sortOrder, name: c.name }).from(c).where(eq(c.householdId, auth.householdId)).orderBy(asc(c.sortOrder), asc(c.name));
  // Mais usadas primeiro; empate (e as nunca usadas) fica na ordem de antes.
  const order = cats.map((x, i) => ({ id: x.id, i, n: uses.get(x.id) ?? 0 })).sort((a, b) => b.n - a.n || a.i - b.i);
  await db.transaction(async (tx) => {
    for (const [i, x] of order.entries()) await tx.update(c).set({ sortOrder: i }).where(eq(c.id, x.id));
  });
  return done(used.length ? "Pronto: as mais usadas estão no topo." : "Ainda não há despesas com categoria para saber quais você usa mais.");
}

// ---------- Contatos (pessoas sem login) ----------

/**
 * "Adicionar pessoa" no lançamento: acha pelo nome (não cria outro Fulano) ou cria um contato.
 * Respeita os limites de contatos (ativos e guardados).
 */
export async function addContact(name: string): Promise<ActionResult & { person?: { id: string; name: string; color: string; archived: boolean }; reused?: boolean }> {
  const auth = await requireAuth();
  const parsed = label("a pessoa").safeParse(name);
  if (!parsed.success) return firstIssue(parsed.error);
  const r = await findOrCreateContact(auth.householdId, parsed.data);
  if (!r.ok) return fail(r.error);
  revalidatePath("/", "layout");
  return {
    ok: true,
    person: { id: r.person.id, name: r.person.name, color: r.person.color, archived: false },
    reused: r.reused,
    message: r.reused ? `Usando ${r.person.name}, que já existe.` : `${r.person.name} adicionado aos contatos.`,
  };
}

/** "Convidar para o app": convite ligado ao contato; ao aceitar, ele vira membro com o histórico dele. */
export async function inviteContact(id: string) {
  return createInvite("member", id);
}

// ---------- Foto e cor das pessoas ----------

const MAX_PHOTO_CHARS = 400_000;

/** Foto de uma pessoa sem login (quem tem login usa a foto do próprio perfil). Recebe JPEG já reduzido. */
export async function setPersonPhoto(id: string, dataUrl: string | null): Promise<ActionResult> {
  const auth = await requireAuth();
  const db = getDb();
  const [login] = await db
    .select({ u: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.participantId, id)))
    .limit(1);
  if (login) return fail("Essa pessoa tem login: a foto vem do perfil dela.");
  let data: string | null = null;
  if (dataUrl) {
    const prefix = "data:image/jpeg;base64,";
    if (!dataUrl.startsWith(prefix) || dataUrl.length > MAX_PHOTO_CHARS) return fail("Imagem inválida ou grande demais.");
    const bytes = Buffer.from(dataUrl.slice(prefix.length), "base64");
    if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return fail("Imagem inválida.");
    data = bytes.toString("base64");
  }
  await db
    .update(schema.participants)
    .set({ photoData: data, photoUpdatedAt: data ? new Date() : null })
    .where(and(eq(schema.participants.id, id), eq(schema.participants.householdId, auth.householdId)));
  return done(data ? "Foto atualizada." : "Foto removida.");
}

/** A sua cor (a da pessoa ligada ao seu login), escolhida no perfil. */
export async function setMyColor(value: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const parsed = color.safeParse(value);
  if (!parsed.success) return firstIssue(parsed.error);
  if (!auth.participantId) return fail("Sua conta não está ligada a uma pessoa da família.");
  await getDb()
    .update(schema.participants)
    .set({ color: parsed.data })
    .where(and(eq(schema.participants.id, auth.participantId), eq(schema.participants.householdId, auth.householdId)));
  return done("Cor atualizada.");
}
