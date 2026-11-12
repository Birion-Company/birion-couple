import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { checkUsername, suggestUsername, USERNAME_MAX } from "./username";

type Db = Pick<ReturnType<typeof getDb>, "select">;

/** O nome está livre (sem contar a própria conta)? */
export async function usernameFree(db: Db, value: string, exceptUserId?: string) {
  const [hit] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(sql`lower(${schema.users.username}) = ${value}`, exceptUserId ? ne(schema.users.id, exceptUserId) : undefined))
    .limit(1);
  return !hit;
}

/** Confere formato, palavrão e se já existe. */
export async function validateUsername(db: Db, raw: string, exceptUserId?: string) {
  const c = checkUsername(raw);
  if (!c.ok) return c;
  if (!(await usernameFree(db, c.value, exceptUserId))) return { ok: false as const, error: `@${c.value} já está em uso. Tente outro.` };
  return c;
}

/** Um nome livre parecido com o nome da pessoa (para contas pelo Google e as antigas). */
export async function freeUsernameFor(db: Db, name: string) {
  const base = suggestUsername(name);
  if (await usernameFree(db, base)) return base;
  for (let i = 0; i < 50; i++) {
    const n = String(Math.floor(Math.random() * 9000) + 100);
    const v = `${base.slice(0, USERNAME_MAX - n.length)}${n}`;
    if (await usernameFree(db, v)) return v;
  }
  return `${base.slice(0, 6)}${Date.now().toString(36)}`.slice(0, USERNAME_MAX);
}

export async function getUsername(userId: string) {
  const [u] = await getDb().select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, userId));
  return u?.username ?? null;
}
