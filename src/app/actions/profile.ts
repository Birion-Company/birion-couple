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
