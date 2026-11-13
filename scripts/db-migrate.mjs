// Aplica as migrações de db/migrations no banco indicado (o app faz isso sozinho ao ligar; use isto para preparar
// um banco antes de importar dados). Uso: node scripts/db-migrate.mjs <mysql-url>
import mysql from "mysql2/promise";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("Uso: node scripts/db-migrate.mjs <mysql-url>");
  process.exit(1);
}
const dir = join(process.cwd(), "db", "migrations");
const conn = await mysql.createConnection({ uri: url, charset: "utf8mb4", timezone: "Z", dateStrings: true });
await conn.query("SET time_zone = '+00:00', sql_mode = CONCAT(@@sql_mode, ',ANSI_QUOTES')");
await conn.query("CREATE TABLE IF NOT EXISTS app_migrations (name VARCHAR(255) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))");
const [rows] = await conn.query("SELECT name FROM app_migrations");
const done = new Set(rows.map((r) => r.name));
if (done.size === 0) await conn.query("ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci").catch(() => {});
let n = 0;
for (const name of readdirSync(dir).sort()) {
  const file = join(dir, name, "migration.sql");
  if (!existsSync(file) || done.has(name)) continue;
  for (const stmt of readFileSync(file, "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await conn.query(stmt);
  await conn.query("INSERT INTO app_migrations (name) VALUES (?)", [name]);
  console.log(`migração aplicada: ${name}`);
  n++;
}
console.log(n ? `${n} migração(ões) aplicada(s).` : "Banco já está em dia.");
await conn.end();
