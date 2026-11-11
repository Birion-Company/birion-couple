/**
 * TEMPORÁRIA — importação única dos dados do banco local para o banco de produção.
 * Só aceita o arquivo exato cuja impressão digital (SHA-256) está abaixo (ninguém mais consegue
 * mandar outro) e só grava se o banco de produção estiver vazio. Os dados não ficam no repositório:
 * vêm no corpo da requisição. Será removida logo depois do uso.
 */
import { createHash } from "node:crypto";
import { getDatabase } from "@netlify/database";

const HASH = "8771b29a79107b554d67ac670bc756d3b5955077f2c733aff246ab3b205da844";

type Table = { table: string; columns: string[]; json: string[]; rows: (string | number | boolean | null)[][] };

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, number>[] }> };

/** Grava os dados (só se o banco estiver vazio), tudo ou nada. Separada para poder testar. */
export async function importar(client: Client, body: string): Promise<Response> {
  if (createHash("sha256").update(body).digest("hex") !== HASH) return new Response("arquivo não reconhecido", { status: 403 });
  const { tables } = JSON.parse(body) as { tables: Table[] };
  try {
    const { rows: [chk] } = await client.query(`select (select count(*) from users)::int u, (select count(*) from households)::int h, (select count(*) from transactions)::int t`);
    if (chk.u || chk.h || chk.t) return new Response(`produção já tem dados: ${JSON.stringify(chk)}`, { status: 409 });
    await client.query("begin");
    const report: string[] = [];
    for (const t of tables) {
      const settles = t.table === "transactions" ? t.columns.indexOf("settlesId") : -1;
      const idCol = t.columns.indexOf("id");
      const later: [unknown, unknown][] = [];
      const rows = t.rows.map((r) => {
        if (settles >= 0 && r[settles]) {
          later.push([r[idCol], r[settles]]);
          const copy = [...r];
          copy[settles] = null;
          return copy;
        }
        return r;
      });
      const list = t.columns.map((c) => `"${c}"`).join(", ");
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const params: unknown[] = [];
        const values = chunk.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(", ")})`);
        await client.query(`insert into "${t.table}" (${list}) values ${values.join(", ")}`, params);
      }
      for (const [id, s] of later) await client.query(`update transactions set "settlesId" = $2 where id = $1`, [id, s]);
      const { rows: [{ n }] } = await client.query(`select count(*)::int n from "${t.table}"`);
      if (n !== t.rows.length) throw new Error(`${t.table}: esperado ${t.rows.length}, gravado ${n}`);
      report.push(`${t.table}: ${n}`);
    }
    await client.query("commit");
    return new Response(`Importado:\n${report.join("\n")}\n`);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return new Response(`Erro, nada gravado: ${(e as Error).message}`, { status: 500 });
  }
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("use POST", { status: 405 });
  const body = await req.text();
  const client = (await getDatabase().pool.connect()) as unknown as Client & { release: () => void };
  try {
    return await importar(client, body);
  } finally {
    client.release();
  }
};
