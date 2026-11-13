import "server-only";
import { drizzle as drizzleNetlify } from "drizzle-orm/netlify-db";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Duas formas de chegar ao banco, com a mesma API de consultas (por isso expomos um tipo só):
 * - DATABASE_URL definido (hospedagem comum, VPS, qualquer Postgres): conexão direta com o `pg`.
 * - sem ele: o adaptador netlify-db, que escolhe sozinho a conexão certa (Netlify Database em produção,
 *   Postgres local via NETLIFY_DB_URL no desenvolvimento).
 */
export type Db = NodePgDatabase<typeof schema>;

let instance: Db | undefined;

export function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (url) {
      // Poucas conexões: hospedagens compartilhadas limitam quantas cada app pode abrir.
      const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
      instance = drizzlePg({ client: pool, schema }) as unknown as Db;
    } else {
      instance = drizzleNetlify({ schema }) as unknown as Db;
    }
  }
  return instance;
}

export { schema };
