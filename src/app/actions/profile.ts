"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import type { ActionResult } from "./settings";

const ProfileSchema = z.object({
  name: z.string().trim().min(1, { error: "Digite seu nome." }).max(60),
  email: z.email({ error: "Digite um e-mail válido." }).trim().toLowerCase(),
});

/** Atualiza nome e e-mail de quem está logado. Se a pessoa ligada a você tinha o nome antigo, ela é renomeada junto. */
export async function updateProfile(input: { name: string; email: string }): Promise<ActionResult> {
  const auth = await requireAuth();
  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, email } = parsed.data;
  const db = getDb();
  const [taken] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), ne(schema.users.id, auth.userId)))
    .limit(1);
  if (taken) return { ok: false, error: "Este e-mail já é usado por outra conta." };
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ name, email }).where(eq(schema.users.id, auth.userId));
    if (auth.participantId) {
      await tx
        .update(schema.participants)
        .set({ name })
        .where(
          and(
            eq(schema.participants.id, auth.participantId),
            eq(schema.participants.householdId, auth.householdId),
            eq(schema.participants.name, auth.userName),
          ),
        );
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil atualizado." };
}

const PasswordSchema = z
  .object({
    current: z.string().min(1, { error: "Digite a senha atual." }),
    next: z.string().min(8, { error: "A nova senha precisa ter pelo menos 8 caracteres." }),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { error: "A confirmação não confere com a nova senha." });

export async function changePassword(input: { current: string; next: string; confirm: string }): Promise<ActionResult> {
  const auth = await requireAuth();
  const parsed = PasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, auth.userId)).limit(1);
  if (!user || !(await bcrypt.compare(parsed.data.current, user.passwordHash))) {
    return { ok: false, error: "A senha atual está incorreta." };
  }
  await db
    .update(schema.users)
    .set({ passwordHash: await bcrypt.hash(parsed.data.next, 10) })
    .where(eq(schema.users.id, auth.userId));
  return { ok: true, message: "Senha alterada." };
}

const MAX_AVATAR_CHARS = 400_000; // ~300 KB de imagem; o navegador já envia reduzida (~20 KB)

/** Recebe a foto já cortada e reduzida no navegador (JPEG em data URL). */
export async function uploadAvatar(dataUrl: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const prefix = "data:image/jpeg;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix) || dataUrl.length > MAX_AVATAR_CHARS) {
    return { ok: false, error: "Imagem inválida ou grande demais." };
  }
  const base64 = dataUrl.slice(prefix.length);
  const bytes = Buffer.from(base64, "base64");
  // Confere a assinatura de JPEG (FF D8 FF) para não guardar outra coisa.
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { ok: false, error: "Imagem inválida." };
  }
  await getDb()
    .update(schema.users)
    .set({ avatarData: bytes.toString("base64"), avatarUpdatedAt: new Date() })
    .where(eq(schema.users.id, auth.userId));
  revalidatePath("/", "layout");
  return { ok: true, message: "Foto atualizada." };
}

export async function removeAvatar(): Promise<ActionResult> {
  const auth = await requireAuth();
  await getDb().update(schema.users).set({ avatarData: null, avatarUpdatedAt: null }).where(eq(schema.users.id, auth.userId));
  revalidatePath("/", "layout");
  return { ok: true, message: "Foto removida." };
}

/** O tutorial foi visto (ou pulado): não abre mais sozinho, em nenhum aparelho. */
export async function markTourSeen(): Promise<void> {
  const auth = await requireAuth();
  await getDb().update(schema.users).set({ tourSeenAt: new Date() }).where(eq(schema.users.id, auth.userId));
}

/**
 * Apelido de uma pessoa com login da família, só para quem está logado (os outros continuam vendo o
 * nome cadastrado). Vazio apaga o apelido. Não dá para apelidar a si mesmo.
 */
export async function setNickname(participantId: string, raw: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const nickname = raw.trim().replace(/\s+/g, " ");
  if (nickname.length > 40) return { ok: false, error: "O apelido pode ter até 40 letras." };
  if (participantId === auth.participantId) return { ok: false, error: "Para mudar o seu nome, use Meu perfil." };
  const db = getDb();
  const [member] = await db
    .select({ pid: schema.memberships.participantId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, auth.householdId), eq(schema.memberships.participantId, participantId)))
    .limit(1);
  if (!member) return { ok: false, error: "Apelido só vale para quem tem login na sua família." };
  const key = and(eq(schema.nicknames.userId, auth.userId), eq(schema.nicknames.participantId, participantId));
  const [p] = await db.select({ name: schema.participants.name }).from(schema.participants).where(eq(schema.participants.id, participantId)).limit(1);
  if (!nickname || nickname === p?.name) {
    await db.delete(schema.nicknames).where(key);
    revalidatePath("/", "layout");
    return { ok: true, message: "Apelido removido. Aparece o nome cadastrado." };
  }
  await db
    .insert(schema.nicknames)
    .values({ userId: auth.userId, participantId, nickname })
    .onConflictDoUpdate({ target: [schema.nicknames.userId, schema.nicknames.participantId], set: { nickname } });
  revalidatePath("/", "layout");
  return { ok: true, message: `Pronto: para você, agora é “${nickname}”.` };
}
