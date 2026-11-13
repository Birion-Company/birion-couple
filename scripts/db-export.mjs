// Exporta TODOS os dados de um banco Postgres antigo para um arquivo JSON (independente de banco).
// Uso: node scripts/db-export.mjs <postgres-url> <arquivo.json>
// O JSON tem { formato, geradoEm, tabelas: { nome: [linhas] } }; datas viram texto ISO (UTC).
import pg from "pg";
import { writeFileSync } from "node:fs";

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error("Uso: node scripts/db-export.mjs <postgres-url> <arquivo.json>");
  process.exit(1);
}
// date e timestamptz como texto, sem conversão de fuso.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(1114, (v) => new Date(v + "Z").toISOString());

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  );
  const tabelas = {};
  for (const { table_name } of rows) {
    if (table_name === "app_migrations") continue;
    const r = await client.query(`select * from "${table_name}"`);
    tabelas[table_name] = r.rows;
    console.log(`${table_name}: ${r.rows.length}`);
  }
  writeFileSync(out, JSON.stringify({ formato: "birion-couple/1", geradoEm: new Date().toISOString(), tabelas }));
  console.log(`Exportado em ${out}`);
} finally {
  await client.end();
}
