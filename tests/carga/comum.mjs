// Teste de carga do Birion Finance. NUNCA aponte para o site publicado (gasta crédito do Netlify e mexe no banco real):
// ele só aceita endereço local. Roda contra um "next start" separado (porta 3002 por padrão).
import { readFileSync } from "node:fs";
import pg from "pg";

export const BASE = process.env.BASE ?? "http://localhost:3002";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error(`BASE precisa ser local (veio ${BASE}). O teste de carga não roda contra o site publicado.`);

function dbUrl() {
  if (process.env.NETLIFY_DB_URL) return process.env.NETLIFY_DB_URL;
  const l = readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n").find((x) => x.startsWith("NETLIFY_DB_URL="));
  return l.slice("NETLIFY_DB_URL=".length).replace(/^"|"$/g, "");
}
export const url = dbUrl();
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("O banco precisa ser o local.");
export async function connect() {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}
export const MEMBROS = 10;
export const SENHA = "senha-forte-123";
export const EMAIL = (i) => `carga${i}@carga.test`;
