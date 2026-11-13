import { and, inArray, type InferInsertModel, type InferSelectModel, type SQL } from "drizzle-orm";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";
import type { MySqlColumn, MySqlTable, SelectedFields } from "drizzle-orm/mysql-core";
import type { Db } from "./index";

/**
 * O MySQL/MariaDB não tem `RETURNING` como o Postgres. Estas funções fazem o mesmo em passos:
 * - insertReturning: o app gera os ids (UUID), insere e depois lê as linhas pelos ids;
 * - updateReturning / deleteReturning: acham os ids que combinam com o filtro, mexem neles e devolvem as linhas.
 * Use dentro de db.transaction(...) quando os passos precisarem valer juntos.
 */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

type AnyTable = MySqlTable & { id: MySqlColumn };
type Row<T extends AnyTable, F extends SelectedFields | undefined> = F extends SelectedFields
  ? SelectResultFields<F>
  : InferSelectModel<T>;

const CHUNK = 1000;

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

async function readByIds<T extends AnyTable, F extends SelectedFields | undefined>(
  db: Executor,
  table: T,
  ids: string[],
  fields?: F,
): Promise<Row<T, F>[]> {
  const found: Record<string, unknown>[] = [];
  for (const part of chunks(ids)) {
    const q = fields ? db.select({ ...fields, __id: table.id } as SelectedFields) : db.select();
    const rows = (await (q as ReturnType<Db["select"]>).from(table).where(inArray(table.id, part))) as Record<string, unknown>[];
    found.push(...rows);
  }
  const key = (r: Record<string, unknown>) => String(fields ? r.__id : r.id);
  const byId = new Map(found.map((r) => [key(r), r]));
  const out: Row<T, F>[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    if (fields) delete r.__id;
    out.push(r as Row<T, F>);
  }
  return out;
}

/** INSERT ... RETURNING. `ignoreDuplicates` equivale a ON CONFLICT DO NOTHING (devolve só o que entrou de fato). */
export async function insertReturning<T extends AnyTable, F extends SelectedFields | undefined = undefined>(
  db: Executor,
  table: T,
  values: InferInsertModel<T> | InferInsertModel<T>[],
  fields?: F,
  opts?: { ignoreDuplicates?: boolean },
): Promise<Row<T, F>[]> {
  const list = (Array.isArray(values) ? values : [values]).map((v) => ({ ...v, id: (v as { id?: string }).id ?? crypto.randomUUID() }));
  if (!list.length) return [];
  for (const part of chunks(list)) {
    const ins = opts?.ignoreDuplicates ? db.insert(table).ignore() : db.insert(table);
    await ins.values(part as InferInsertModel<T>[]);
  }
  return readByIds(db, table, list.map((v) => v.id), fields);
}

/** UPDATE ... RETURNING: devolve as linhas já alteradas. */
export async function updateReturning<T extends AnyTable, F extends SelectedFields | undefined = undefined>(
  db: Executor,
  table: T,
  set: Partial<InferInsertModel<T>> | Record<string, unknown>,
  where: SQL | undefined,
  fields?: F,
): Promise<Row<T, F>[]> {
  // FOR UPDATE: dentro de uma transação, quem chegar depois espera e vê o resultado do primeiro (ex.: convite usado uma vez só).
  const ids = (await db.select({ id: table.id }).from(table).where(where).for("update")).map((r) => String(r.id));
  if (!ids.length) return [];
  for (const part of chunks(ids)) {
    await db.update(table).set(set as never).where(and(where, inArray(table.id, part)));
  }
  return readByIds(db, table, ids, fields);
}

/** DELETE ... RETURNING: devolve as linhas que foram apagadas. */
export async function deleteReturning<T extends AnyTable, F extends SelectedFields | undefined = undefined>(
  db: Executor,
  table: T,
  where: SQL | undefined,
  fields?: F,
): Promise<Row<T, F>[]> {
  // FOR UPDATE: dentro de uma transação, quem chegar depois espera e vê o resultado do primeiro (ex.: convite usado uma vez só).
  const ids = (await db.select({ id: table.id }).from(table).where(where).for("update")).map((r) => String(r.id));
  if (!ids.length) return [];
  const rows = await readByIds(db, table, ids, fields);
  for (const part of chunks(ids)) await db.delete(table).where(inArray(table.id, part));
  return rows;
}

/** Quantas linhas o último INSERT/UPDATE/DELETE alterou (para "reivindicar" algo uma vez só). */
export function affected(result: unknown): number {
  const head = Array.isArray(result) ? result[0] : result;
  return Number((head as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

