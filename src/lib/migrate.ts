import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { mysqlPoolOptions } from "@/db/connection";

/**
 * Aplica as migrações de db/migrations que ainda não rodaram, na ordem. Roda sozinho ao ligar o app.
 * Um bloqueio do próprio banco (GET_LOCK) impede duas cópias do app de migrar ao mesmo tempo.
 * No MySQL/MariaDB os comandos de estrutura (CREATE/ALTER) não voltam atrás, então cada migração fica
 * registrada em app_migrations só depois de terminar inteira.
 */
export async function runMigrations(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) return 0;
  const dir = join(process.cwd(), "db", "migrations");
  if (!existsSync(dir)) return 0;
  const conn = await mysql.createConnection({ ...mysqlPoolOptions(url), multipleStatements: false });
  let applied = 0;
  try {
    await conn.query("SET time_zone = '+00:00', sql_mode = CONCAT(@@sql_mode, ',ANSI_QUOTES')");
    const [lock] = await conn.query<mysql.RowDataPacket[]>("SELECT GET_LOCK('birion_migrate', 120) AS ok");
    if (!lock[0]?.ok) throw new Error("outra cópia do app está migrando o banco");
    await conn.query("CREATE TABLE IF NOT EXISTS app_migrations (name VARCHAR(255) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))");
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT name FROM app_migrations");
    if (rows.length === 0) {
      // Primeira vez: garante acentos e emojis (utf8mb4) mesmo que o banco tenha sido criado com outro padrão.
      await conn.query("ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci").catch(() => {});
    }
    const done = new Set(rows.map((r) => r.name as string));
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name, "migration.sql");
      if (!existsSync(file) || done.has(name)) continue;
      try {
        for (const stmt of readFileSync(file, "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await conn.query(stmt);
        await conn.query("INSERT INTO app_migrations (name) VALUES (?)", [name]);
        applied++;
        console.log(`[banco] migração aplicada: ${name}`);
      } catch (e) {
        throw new Error(`migração ${name} falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK('birion_migrate')").catch(() => {});
    await conn.end();
  }
  return applied;
}
