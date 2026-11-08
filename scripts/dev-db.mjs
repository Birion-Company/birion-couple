// Sobe um Postgres local (o mesmo motor do Netlify Database) e aplica as migrações.
// Uso: npm run db:dev   — depois rode o app com NETLIFY_DB_URL apontando para a URL mostrada.
import { NetlifyDB } from "@netlify/database-dev";

// 54330 (e não 54329, o padrão): a 54329 costuma estar ocupada por outros Postgres locais, como o do Gartrol.
const port = Number(process.env.DB_PORT ?? 54330);
const db = new NetlifyDB({ directory: process.env.DB_DIR ?? ".netlify/dev-db", port, logger: () => {} });
const url = await db.start();
const applied = await db.applyMigrations("netlify/database/migrations");
console.log(`Banco local pronto: ${url}`);
if (applied.length) console.log(`Migrações aplicadas: ${applied.join(", ")}`);
const stop = async () => {
  await db.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
