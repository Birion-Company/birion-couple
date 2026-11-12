"use server";

import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { canEditTx } from "@/lib/access";
import { involved, logActivity, snapshots } from "@/lib/activity";
import { requireAuth, requireOwner, type AuthContext } from "@/lib/auth";
import { ruleMatches } from "@/lib/rules-server";
import { findOrCreateContact, hasRoomForContact } from "@/lib/contacts";
import { deletePersonalData, leaveHousehold, releaseContacts } from "@/lib/leave";
import { logFamily } from "@/lib/family-log";
import { destroySession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ICON_KEYS } from "@/lib/category-icons";
import { ADMINS_FULL_MESSAGE, ADMINS_MAX, HOUSEHOLD_NAME_MAX, INVITE_VALID_HOURS, INVITES_OPEN_MAX, MEMBERS_FULL_MESSAGE } from "@/lib/defaults";
import { hasRoomForMember } from "@/lib/household";

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
  const db = getDb();
  // Trocar a moeda só muda o símbolo (os valores não são convertidos): depois que há lançamentos, fica travada.
  if (parsed.data.currency !== auth.currency) {
    const [{ n }] = await db.select({ n: count() }).from(schema.transactions).where(eq(schema.transactions.householdId, auth.householdId));
    if (n > 0) return fail("A moeda não pode mudar depois que a família tem lançamentos: os valores não são convertidos, só o símbolo mudaria.");
  }
  await db.update(schema.households).set(parsed.data).where(eq(schema.households.id, auth.householdId));
  const changes = [
    parsed.data.name !== auth.householdName ? `mudou o nome da família de “${auth.householdName}” para “${parsed.data.name}”` : null,
    parsed.data.currency !== auth.currency ? `mudou a moeda de ${auth.currency} para ${parsed.data.currency}` : null,
  ].filter(Boolean);
  if (changes.length)
    await logFamily(db, { householdId: auth.householdId, actorUserId: auth.userId, actorName: auth.userName, action: "household", text: `${auth.userName} ${changes.join(" e ")}.` });
  revalidatePath("/", "layout");
  return done("Família atualizada.");
}

/**
 * Apaga a família e todos os dados dela. Contas de login que não participam de outra família
 * também são apagadas. Exige digitar o nome da família para confirmar.
 */
/**
 * Excluir meus dados: apaga tudo que esta pessoa lançou na família (lançamentos, contas que repetem e
 * importações). Some para todo mundo: se ela lançou que o Fulano devia R$ 2, essa dívida some também para
 * o Fulano. A conta e a família continuam.
 */
export async function deleteMyData(confirm: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (confirm.trim().toUpperCase() !== "EXCLUIR") return fail("Digite EXCLUIR para confirmar.");
  const removed = await getDb().transaction((tx) => deletePersonalData(tx, auth.userId, auth.householdId));
  revalidatePath("/", "layout");
  return done(
    removed === 0
      ? "Você não tinha lançamentos só seus nesta família."
      : `Pronto: ${removed} ${removed === 1 ? "lançamento apagado" : "lançamentos apagados"}. O que envolve outras pessoas com login continua.`,
  );
}

/**
 * Apagar a conta, para sempre: apaga o que é só seu, seus contatos e o login. Nos lançamentos com outras
 * pessoas com login, você vira um nome sem login (as dívidas continuam para elas).
 */
export async function deleteAccount(confirm: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (confirm.trim().toUpperCase() !== "APAGAR") return fail("Digite APAGAR para confirmar.");
  const db = getDb();
  await db.transaction(async (tx) => {
    const homes = await tx.select({ hid: schema.memberships.householdId }).from(schema.memberships).where(eq(schema.memberships.userId, auth.userId));
    for (const { hid } of homes) {
      await logFamily(tx, { householdId: hid, actorUserId: null, actorName: auth.userName, action: "account_deleted", text: `${auth.userName} apagou a conta (continua nos lançamentos com outras pessoas, sem login).` });
      await deletePersonalData(tx, auth.userId, hid);
      // Contatos seus que ficam (estão em lançamentos com outras pessoas) perdem o nome: ninguém mais é dono deles.
      await tx
        .update(schema.participants)
        .set({ name: `Contato de ${auth.userName.split(" ")[0]}`, photoData: null, photoUpdatedAt: null })
        .where(and(eq(schema.participants.householdId, hid), eq(schema.participants.ownerUserId, auth.userId)));
      await leaveHousehold(tx, auth.userId, hid, { wipeIfEmpty: true });
    }
    await tx.delete(schema.users).where(eq(schema.users.id, auth.userId));
  });
  await destroySession();
  redirect("/entrar?conta=apagada");
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

/** Contato só é mexido por quem é dono dele. */
const mineOnly = (kind: ListKind, userId: string) => (kind === "participants" ? eq(schema.participants.ownerUserId, userId) : undefined);

export async function saveListItem(kind: ListKind, id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const auth = await requireAuth();
  const parsed = shapes[kind].safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const db = getDb();
  const table = tables[kind];
  const data = parsed.data as Record<string, unknown>;
  // Pessoa nova criada aqui é um contato (sem login): respeita o limite de contatos.
  if (kind === "participants" && !id) {
    const full = await hasRoomForContact(auth.householdId, auth.userId, { creating: true });
    if (full) return fail(full);
  }

  await db.transaction(async (tx) => {
    // Só pode haver um status padrão para lançamentos e um para importações.
    if (kind === "statuses") {
      if (data.isDefault) await tx.update(schema.statuses).set({ isDefault: false }).where(eq(schema.statuses.householdId, auth.householdId));
      if (data.isImportDefault) await tx.update(schema.statuses).set({ isImportDefault: false }).where(eq(schema.statuses.householdId, auth.householdId));
    }
    if (id) {
      await tx.update(table).set(data).where(and(eq(table.id, id), eq(table.householdId, auth.householdId), mineOnly(kind, auth.userId)));
    } else {
      const [{ n }] = await tx.select({ n: count() }).from(table).where(eq(table.householdId, auth.householdId));
      // Contato novo é de quem criou (os outros não veem).
      const owner = kind === "participants" ? { ownerUserId: auth.userId } : {};
      await tx.insert(table).values({ ...data, ...owner, householdId: auth.householdId, ...("sortOrder" in table ? { sortOrder: n } : {}) } as never);
    }
  });
  return done(id ? "Salvo." : "Adicionado.");
}

export async function setArchived(kind: ListKind, id: string, archived: boolean): Promise<ActionResult> {
  const auth = await requireAuth();
  const table = tables[kind];
  if (kind === "participants" && !archived) {
    const full = await hasRoomForContact(auth.householdId, auth.userId);
    if (full) return fail(full);
  }
  await getDb().update(table).set({ archived }).where(and(eq(table.id, id), eq(table.householdId, auth.householdId), mineOnly(kind, auth.userId)));
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
  await db.delete(table).where(and(eq(table.id, id), eq(table.householdId, auth.householdId), mineOnly(kind, auth.userId)));
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

/** Quantas pessoas administram a família. */
async function adminCount(householdId: string) {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, householdId), eq(schema.memberships.role, "owner")));
  return n;
}

/** Cria o link de convite (quem chama já conferiu a permissão). */
async function makeInvite(
  auth: { householdId: string; userId: string; userName: string },
  role: "owner" | "member",
  participantId: string | null,
  forName?: string,
): Promise<ActionResult & { code?: string; inviteId?: string }> {
  if (!(await hasRoomForMember(getDb(), auth.householdId))) return fail(MEMBERS_FULL_MESSAGE);
  if (role === "owner" && (await adminCount(auth.householdId)) >= ADMINS_MAX) return fail(ADMINS_FULL_MESSAGE);
  const [{ open }] = await getDb()
    .select({ open: count() })
    .from(schema.invites)
    .where(and(eq(schema.invites.householdId, auth.householdId), isNull(schema.invites.usedAt), gte(schema.invites.expiresAt, new Date()), sql`${schema.invites.createdAt} > now() - interval '1 day'`));
  if (open >= INVITES_OPEN_MAX) return fail(`Já há ${INVITES_OPEN_MAX} convites abertos, o máximo. Cancele um ou espere vencer.`);
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
  const db = getDb();
  const [inv] = await db
    .insert(schema.invites)
    .values({
      householdId: auth.householdId,
      code,
      role: role === "owner" ? "owner" : "member",
      label: forName ? `Convite ${forName}`.slice(0, 40) : null,
      participantId,
      createdBy: auth.userId,
      expiresAt: new Date(Date.now() + INVITE_VALID_HOURS * 3600 * 1000),
    })
    .returning({ id: schema.invites.id });
  await logFamily(db, {
    householdId: auth.householdId,
    actorUserId: auth.userId,
    actorName: auth.userName,
    action: "invite",
    text: `${auth.userName} gerou um convite${forName ? ` para ${forName}` : ""} ${role === "owner" ? "como administrador" : "como membro"}.`,
  });
  revalidatePath("/ajustes", "layout");
  return { ok: true, code, inviteId: inv.id, message: "Convite criado. Vale por 1 dia e para uma pessoa." };
}

export async function createInvite(role: "owner" | "member", participantId: string | null = null, name?: string): Promise<ActionResult & { code?: string }> {
  const auth = await requireOwner();
  const label = name?.trim().replace(/^convite\s+/i, "").slice(0, 30);
  return makeInvite(auth, role, participantId, label || undefined);
}

const FOR_NAME = z.string().trim().min(1, { error: "Diga para quem é o convite." }).max(60);

/**
 * Membro pede um convite (para quem administra aceitar). Pode ser a partir de um contato seu: ao aceitar
 * o convite, a pessoa fica com o histórico desse contato.
 */
export async function requestInvite(forName: string, contactId: string | null = null): Promise<ActionResult> {
  const auth = await requireAuth();
  const db = getDb();
  let name = forName;
  if (contactId) {
    const [c] = await db
      .select({ name: schema.participants.name })
      .from(schema.participants)
      .where(and(eq(schema.participants.id, contactId), eq(schema.participants.householdId, auth.householdId), eq(schema.participants.ownerUserId, auth.userId)));
    if (!c) return fail("Esse contato não é seu.");
    name = c.name;
  }
  const parsed = FOR_NAME.safeParse(name);
  if (!parsed.success) return firstIssue(parsed.error);
  const R = schema.inviteRequests;
  const [open] = await db
    .select({ n: count() })
    .from(R)
    .where(and(eq(R.householdId, auth.householdId), eq(R.requestedBy, auth.userId), eq(R.status, "pending")));
  if (open.n >= 5) return fail("Você já tem 5 pedidos esperando. Espere quem administra responder.");
  await db.insert(R).values({ householdId: auth.householdId, requestedBy: auth.userId, forName: parsed.data, contactId });
  await logFamily(db, {
    householdId: auth.householdId,
    actorUserId: auth.userId,
    actorName: auth.userName,
    action: "invite_request",
    text: `${auth.userName} pediu um convite para ${parsed.data}.`,
  });
  revalidatePath("/ajustes", "layout");
  return done("Pedido enviado. Quando quem administra aceitar, o link aparece aqui para você mandar.");
}

/** Quem administra aceita (gera o link para quem pediu) ou recusa um pedido de convite. */
export async function decideInviteRequest(id: string, approve: boolean, reason?: string): Promise<ActionResult> {
  const auth = await requireOwner();
  const db = getDb();
  const R = schema.inviteRequests;
  const [r] = await db
    .select({ id: R.id, forName: R.forName, contactId: R.contactId, status: R.status, requestedBy: R.requestedBy, who: schema.users.name })
    .from(R)
    .innerJoin(schema.users, eq(schema.users.id, R.requestedBy))
    .where(and(eq(R.id, id), eq(R.householdId, auth.householdId)));
  if (!r) return fail("Pedido não encontrado.");
  if (r.status !== "pending") return fail("Esse pedido já foi respondido.");
  const why = reason?.trim().slice(0, 200) || null;
  if (approve) {
    const inv = await makeInvite(auth, "member", r.contactId, r.forName);
    if (!inv.ok) return inv;
    await db.update(R).set({ status: "approved", inviteId: inv.inviteId, decidedBy: auth.userId, decidedAt: new Date() }).where(eq(R.id, id));
  } else {
    await db.update(R).set({ status: "declined", reason: why, decidedBy: auth.userId, decidedAt: new Date() }).where(eq(R.id, id));
  }
  await logFamily(db, {
    householdId: auth.householdId,
    actorUserId: auth.userId,
    actorName: auth.userName,
    subjectUserId: r.requestedBy,
    action: approve ? "invite_request_ok" : "invite_request_no",
    text: approve
      ? `${auth.userName} aceitou o pedido de ${r.who} e gerou o convite para ${r.forName}.`
      : `${auth.userName} recusou o pedido de ${r.who} (convite para ${r.forName})${why ? `: “${why}”` : ""}.`,
  });
  revalidatePath("/ajustes", "layout");
  return done(approve ? `Convite gerado. ${r.who.split(" ")[0]} já pode copiar o link.` : "Pedido recusado.");
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const auth = await requireOwner();
  const db = getDb();
  const del = await db.delete(schema.invites).where(and(eq(schema.invites.id, id), eq(schema.invites.householdId, auth.householdId))).returning({ id: schema.invites.id });
  if (del.length)
    await logFamily(db, { householdId: auth.householdId, actorUserId: auth.userId, actorName: auth.userName, action: "invite_revoked", text: `${auth.userName} cancelou um convite.` });
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
  } else if ((await adminCount(auth.householdId)) >= ADMINS_MAX) {
    return fail(ADMINS_FULL_MESSAGE);
  }
  const done1 = await db
    .update(schema.memberships)
    .set({ role })
    .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.userId, userId), ne(schema.memberships.role, role)))
    .returning({ id: schema.memberships.userId });
  if (done1.length) {
    const [who] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
    await logFamily(db, {
      householdId: auth.householdId,
      actorUserId: auth.userId,
      actorName: auth.userName,
      subjectUserId: userId,
      action: "role",
      text: role === "owner" ? `${auth.userName} tornou ${who?.name ?? "alguém"} administrador.` : `${auth.userName} tirou ${who?.name ?? "alguém"} da administração (agora é membro).`,
    });
  }
  revalidatePath("/", "layout");
  return done("Permissão atualizada.");
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const auth = await requireOwner();
  if (userId === auth.userId) return fail("Você não pode remover a si mesmo.");
  const db = getDb();
  const [who] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.memberships)
      .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.userId, userId)));
    await releaseContacts(tx, userId, auth.householdId, who?.name ?? "alguém");
  });
  await logFamily(db, {
    householdId: auth.householdId,
    actorUserId: auth.userId,
    actorName: auth.userName,
    subjectUserId: userId,
    action: "removed",
    text: `${auth.userName} tirou o acesso de ${who?.name ?? "alguém"} (continua nos lançamentos, sem login).`,
  });
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
  const r = await findOrCreateContact(auth.householdId, auth.userId, parsed.data);
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
export async function inviteContact(id: string): Promise<ActionResult & { code?: string }> {
  const auth = await requireAuth();
  const [c] = await getDb()
    .select({ id: schema.participants.id })
    .from(schema.participants)
    .where(and(eq(schema.participants.id, id), eq(schema.participants.householdId, auth.householdId), eq(schema.participants.ownerUserId, auth.userId)));
  if (!c) return fail("Esse contato não é seu.");
  // Quem administra gera o link na hora; membro faz um pedido.
  if (auth.role !== "owner") return requestInvite("", id);
  return makeInvite(auth, "member", id);
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
  const [own] = await db
    .select({ id: schema.participants.id })
    .from(schema.participants)
    .where(and(eq(schema.participants.id, id), eq(schema.participants.ownerUserId, auth.userId)));
  if (!own) return fail("Esse contato não é seu.");
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

// ---------- Contato que entrou na família ----------

type SplitJson = { participantId: string; amountCents: number };

/**
 * Seu contato (sem login) agora tem conta na família: tudo que estava no nome dele passa para a pessoa
 * com login (quem pagou, as partes de cada um, as contas que se repetem) e o contato some. Como os
 * lançamentos mudam de pessoa, ela recebe em "Para confirmar" para aceitar.
 */
export async function mergeContactIntoMember(contactId: string, memberPid: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const db = getDb();
  const P = schema.participants;
  const [contact] = await db
    .select({ id: P.id, name: P.name })
    .from(P)
    .where(and(eq(P.id, contactId), eq(P.householdId, auth.householdId), eq(P.ownerUserId, auth.userId)));
  if (!contact) return fail("Escolha um contato seu.");
  const [member] = await db
    .select({ pid: schema.memberships.participantId, name: P.name })
    .from(schema.memberships)
    .innerJoin(P, eq(P.id, schema.memberships.participantId))
    .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.participantId, memberPid)));
  if (!member?.pid) return fail("Escolha uma pessoa com login da família.");
  const t = schema.transactions;
  const S = schema.transactionSplits;
  const moved = await db.transaction(async (q) => {
    const payer = await q
      .update(t)
      .set({ payerId: member.pid, updatedAt: new Date() })
      .where(and(eq(t.householdId, auth.householdId), eq(t.payerId, contactId)))
      .returning({ id: t.id });
    // Partes: se a pessoa já tinha parte no mesmo lançamento, soma; senão, a parte muda de nome.
    const parts = await q.select().from(S).where(eq(S.participantId, contactId));
    for (const sp of parts) {
      const [already] = await q.select().from(S).where(and(eq(S.transactionId, sp.transactionId), eq(S.participantId, member.pid!)));
      if (already) {
        await q.update(S).set({ amountCents: already.amountCents + sp.amountCents }).where(and(eq(S.transactionId, sp.transactionId), eq(S.participantId, member.pid!)));
        await q.delete(S).where(and(eq(S.transactionId, sp.transactionId), eq(S.participantId, contactId)));
      } else {
        await q.update(S).set({ participantId: member.pid! }).where(and(eq(S.transactionId, sp.transactionId), eq(S.participantId, contactId)));
      }
    }
    // Contas que se repetem (os próximos meses saem já no nome da pessoa).
    const R = schema.recurringSeries;
    const series = await q.select({ id: R.id, payerId: R.payerId, splits: R.splits }).from(R).where(eq(R.householdId, auth.householdId));
    for (const r of series) {
      const list = (r.splits as SplitJson[]) ?? [];
      if (r.payerId !== contactId && !list.some((x) => x.participantId === contactId)) continue;
      const merged = new Map<string, number>();
      for (const x of list) {
        const id = x.participantId === contactId ? member.pid! : x.participantId;
        merged.set(id, (merged.get(id) ?? 0) + x.amountCents);
      }
      await q
        .update(R)
        .set({ payerId: r.payerId === contactId ? member.pid : r.payerId, splits: [...merged].map(([participantId, amountCents]) => ({ participantId, amountCents })) })
        .where(eq(R.id, r.id));
    }
    await q.update(schema.invites).set({ participantId: null }).where(eq(schema.invites.participantId, contactId));
    await q.delete(P).where(eq(P.id, contactId));
    await logFamily(q, {
      householdId: auth.householdId,
      actorUserId: auth.userId,
      actorName: auth.userName,
      action: "contact_merged",
      text: `${auth.userName} passou as contas de um contato dele para ${member.name}.`,
    });
    return new Set([...payer.map((x) => x.id), ...parts.map((x) => x.transactionId)]).size;
  });
  revalidatePath("/", "layout");
  return done(
    moved === 0
      ? `${contact.name} saiu dos contatos: agora é ${member.name}.`
      : `Pronto: ${moved} ${moved === 1 ? "lançamento passou" : "lançamentos passaram"} de ${contact.name} para ${member.name}. Ela recebe em Para confirmar.`,
  );
}
