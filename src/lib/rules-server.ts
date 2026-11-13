import "server-only";
import { and, eq, isNull, ne, or, like as sqlLike } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { matchCategory } from "./import/dedupe";
import { historyCategory } from "./patterns-server";

/** Regras de categoria da família ("uber" → Transporte). */
export async function loadRules(householdId: string) {
  return getDb()
    .select({ pattern: schema.categoryRules.pattern, categoryId: schema.categoryRules.categoryId })
    .from(schema.categoryRules)
    .where(eq(schema.categoryRules.householdId, householdId));
}

/**
 * Categoria quando o lançamento ficou sem: primeiro as regras, depois o histórico do estabelecimento
 * (a última compra no mesmo lugar). Só despesas e receitas têm categoria.
 */
export async function ruleCategory(householdId: string, kind: string, description: string, categoryId: string | null) {
  // Só despesa tem categoria (receita, empréstimo e acerto não).
  if (kind !== "expense") return null;
  if (categoryId) return categoryId;
  return matchCategory(description, await loadRules(householdId)) ?? (await historyCategory(householdId, description));
}

/** Lançamentos (despesas e receitas) cuja descrição contém o texto e que ainda não estão na categoria. */
export function ruleMatches(householdId: string, pattern: string, categoryId: string) {
  const like = `%${pattern.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const t = schema.transactions;
  return getDb()
    .select({ id: t.id, createdBy: t.createdBy, description: t.description, categoryId: t.categoryId })
    .from(t)
    .where(
      and(
        eq(t.householdId, householdId),
        eq(t.kind, "expense"),
        sqlLike(t.description, like),
        or(isNull(t.categoryId), ne(t.categoryId, categoryId)),
      ),
    );
}
