import "server-only";
import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { mysqlPoolOptions, prepareConnection } from "./connection";
import * as schema from "./schema";

export type Db = MySql2Database<typeof schema>;

let instance: Db | undefined;

export function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definido (ex.: mysql://usuario:senha@127.0.0.1:3306/banco).");
    // Poucas conexões: hospedagens compartilhadas limitam quantas cada app pode abrir.
    const pool = mysql.createPool(mysqlPoolOptions(url, Number(process.env.DATABASE_POOL_MAX ?? 5)));
    prepareConnection(pool);
    instance = drizzle({ client: pool, schema, mode: "default" }) as unknown as Db;
  }
  return instance;
}

export { schema };
