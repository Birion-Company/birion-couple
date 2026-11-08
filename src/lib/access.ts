import "server-only";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { AuthContext } from "./auth";

/**
 * Quem está olhando. Regras da família:
 * - Quem administra (owner) vê e altera tudo.
 * - Os outros membros veem só os lançamentos que os envolvem: criaram, pagaram ou têm uma parte.
 * - Só quem criou o lançamento (ou quem administra) pode alterar ou excluir.
 */
export type Viewer = Pick<AuthContext, "householdId" | "userId" | "participantId" | "role">;

export const isAdmin = (v: Viewer) => v.role === "owner";

const t = schema.transactions;

/** Condição SQL de "este lançamento é visível para esta pessoa" (nada para quem administra). */
export function visibleTx(v: Viewer): SQL | undefined {
  if (isAdmin(v)) return undefined;
  const parts: SQL[] = [eq(t.createdBy, v.userId)];
  if (v.participantId) {
    parts.push(eq(t.payerId, v.participantId));
    parts.push(
      sql`exists (select 1 from "transaction_splits" s where s."transactionId" = "transactions"."id" and s."participantId" = ${v.participantId})`,
    );
  }
  return or(...parts);
}

/** Lançamentos da família que esta pessoa pode ver, já com o filtro de acesso. */
export function txScope(v: Viewer, ...extra: (SQL | undefined)[]): SQL {
  return and(eq(t.householdId, v.householdId), visibleTx(v), ...extra)!;
}

/** Pode alterar este lançamento? */
export function canEditTx(v: Viewer, createdBy: string | null) {
  return isAdmin(v) || (createdBy !== null && createdBy === v.userId);
}

export const NOT_YOURS = "Você só pode alterar lançamentos que você criou. Peça para quem criou (ou para quem administra a família).";

/**
 * Confere se todos os ids são da família e podem ser alterados por esta pessoa.
 * Devolve uma mensagem de erro, ou null se estiver tudo certo.
 */
export async function checkEditable(v: Viewer, ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const rows = await getDb()
    .select({ id: t.id, createdBy: t.createdBy })
    .from(t)
    .where(and(eq(t.householdId, v.householdId), inArray(t.id, ids)));
  if (rows.length !== new Set(ids).size) return "Lançamento não encontrado.";
  return rows.every((r) => canEditTx(v, r.createdBy)) ? null : NOT_YOURS;
}
