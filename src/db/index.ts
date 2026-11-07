import "server-only";
import { drizzle } from "drizzle-orm/netlify-db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * O adaptador netlify-db escolhe sozinho a conexão certa (Netlify Database em produção,
 * Postgres local via NETLIFY_DB_URL no desenvolvimento). As duas variantes têm a mesma API
 * de consultas, então expomos um tipo só.
 */
export type Db = NodePgDatabase<typeof schema>;

let instance: Db | undefined;

export function getDb(): Db {
  if (!instance) {
    instance = drizzle({ schema }) as unknown as Db;
  }
  return instance;
}

export { schema };
