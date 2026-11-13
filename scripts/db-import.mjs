// Importa o JSON gerado por db-export.mjs para o banco MySQL/MariaDB do app (que já deve ter as tabelas,
// criadas pelas migrações). Não apaga nada: se uma tabela já tem linhas, para (use --substituir para esvaziar antes).
// Uso: node scripts/db-import.mjs <mysql-url> <arquivo.json> [--substituir]
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const [url, file, flag] = process.argv.slice(2);
if (!url || !file) {
  console.error("Uso: node scripts/db-import.mjs <mysql-url> <arquivo.json> [--substituir]");
  process.exit(1);
}
const dump = JSON.parse(readFileSync(file, "utf8"));
if (dump.formato !== "birion-couple/1") throw new Error(`Formato desconhecido: ${dump.formato}`);

const conn = await mysql.createConnection({ uri: url, charset: "utf8mb4", timezone: "Z", dateStrings: true, multipleStatements: false });
await conn.query("SET time_zone = '+00:00'");
const [dbRow] = await conn.query("select database() as d");
const schemaName = dbRow[0].d;

const toDateTime = (v) => (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? v.replace("T", " ").replace("Z", "").slice(0, 23) : v);

let total = 0;
try {
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const [table, rows] of Object.entries(dump.tabelas)) {
    const [cols] = await conn.query(
      "select column_name as name, data_type as type from information_schema.columns where table_schema = ? and table_name = ?",
      [schemaName, table],
    );
    if (!cols.length) {
      console.log(`(ignorada: a tabela ${table} não existe no destino)`);
      continue;
    }
    const [[{ n }]] = await conn.query(`select count(*) as n from \`${table}\``);
    if (n > 0) {
      if (flag !== "--substituir") throw new Error(`A tabela ${table} já tem ${n} linhas. Use --substituir para esvaziar antes.`);
      await conn.query(`delete from \`${table}\``);
    }
    const type = Object.fromEntries(cols.map((c) => [c.name, c.type]));
    const names = Object.keys(type).filter((c) => rows.length && c in rows[0]);
    if (!rows.length) {
      console.log(`${table}: 0`);
      continue;
    }
    const convert = (col, v) => {
      if (v === null || v === undefined) return null;
      const t = type[col];
      if (t === "datetime" || t === "timestamp") return toDateTime(v);
      if (t === "json" || t === "longtext" && typeof v === "object") return JSON.stringify(v);
      if (typeof v === "boolean") return v ? 1 : 0;
      if (typeof v === "object") return JSON.stringify(v);
      return v;
    };
    for (let i = 0; i < rows.length; i += 200) {
      const part = rows.slice(i, i + 200);
      const marks = part.map(() => `(${names.map(() => "?").join(",")})`).join(",");
      const values = part.flatMap((r) => names.map((c) => convert(c, r[c])));
      await conn.query(`insert into \`${table}\` (${names.map((c) => `\`${c}\``).join(",")}) values ${marks}`, values);
    }
    const [[{ n: after }]] = await conn.query(`select count(*) as n from \`${table}\``);
    if (after !== rows.length) throw new Error(`${table}: esperava ${rows.length} linhas e ficaram ${after}`);
    total += rows.length;
    console.log(`${table}: ${rows.length}`);
  }
} finally {
  await conn.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
  await conn.end();
}
console.log(`Importação concluída: ${total} linhas.`);
