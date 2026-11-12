"use server";

import { getDb } from "@/db";
import { readSession } from "@/lib/session";
import { validateUsername } from "@/lib/username-server";

/** Confere enquanto a pessoa digita: formato, palavrão e se já existe. */
export async function checkUsernameAvailable(raw: string): Promise<{ ok: boolean; message: string }> {
  const s = await readSession();
  const r = await validateUsername(getDb(), raw, s?.uid);
  return r.ok ? { ok: true, message: `@${r.value} está livre.` } : { ok: false, message: r.error };
}
