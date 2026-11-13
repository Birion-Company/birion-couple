"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import type { ActionResult } from "./settings";

const A = schema.accounts;
const MAX = 100_000_000_00;

/** Aceita "-50,00" (conta no vermelho). */
const parse = (v: string) => {
  const neg = v.trim().startsWith("-");
  const c = parseAmountToCents(v.replace("-", ""), ",");
  return c === null || c > MAX ? null : neg ? -c : c;
};

export async function createAccount(name: string, balance: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const n = name.trim().slice(0, 40);
  if (!n) return { ok: false, error: "Dê um nome para a conta." };
  const cents = balance.trim() ? parse(balance) : 0;
  if (cents === null) return { ok: false, error: "Saldo inválido." };
  await getDb().insert(A).values({ userId: auth.userId, name: n, balanceCents: cents });
  revalidatePath("/", "layout");
  return { ok: true, message: `Conta "${n}" criada.` };
}

export async function setAccountBalance(id: string, balance: string): Promise<ActionResult> {
  const auth = await requireAuth();
  const cents = parse(balance);
  if (cents === null) return { ok: false, error: "Saldo inválido." };
  const res = await getDb().update(A).set({ balanceCents: cents, updatedAt: new Date() }).where(and(eq(A.id, id), eq(A.userId, auth.userId))).returning({ id: A.id });
  if (!res.length) return { ok: false, error: "Conta não encontrada." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saldo atualizado." };
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  await getDb().delete(A).where(and(eq(A.id, id), eq(A.userId, auth.userId)));
  revalidatePath("/", "layout");
  return { ok: true, message: "Conta apagada." };
}
