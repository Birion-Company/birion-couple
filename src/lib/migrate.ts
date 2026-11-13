import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

/**
 * Aplica as migrações de netlify/database/migrations que ainda não rodaram, na ordem, num banco comum
 * (DATABASE_URL). No Netlify quem faz isso é o próprio deploy; aqui roda sozinho ao ligar o app.
 * Cada migração roda numa transação; um bloqueio impede duas cópias do app de migrar ao mesmo tempo.
 */
export async function runMigrations(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) return 0;
  const dir = join(process.cwd(), "netlify", "database", "migrations");
  if (!existsSync(dir)) return 0;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let applied = 0;
  try {
    await client.query("select pg_advisory_lock(727274)");
    await client.query("create table if not exists public.app_migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query("select name from public.app_migrations")).rows.map((r) => r.name as string));
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name, "migration.sql");
      if (!existsSync(file) || done.has(name)) continue;
      await client.query("begin");
      try {
        for (const stmt of readFileSync(file, "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await client.query(stmt);
        await client.query("insert into public.app_migrations (name) values ($1)", [name]);
        await client.query("commit");
        applied++;
        console.log(`[banco] migração aplicada: ${name}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`migração ${name} falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock(727274)").catch(() => {});
    await client.end();
  }
  return applied;
}
