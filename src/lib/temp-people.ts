import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeBalances } from "./balances";
import { todayIn } from "./cards";
import { PALETTE } from "./defaults";

const p = schema.participants;
const t = schema.transactions;

/** "  júlio  césar " → "júlio césar" (para comparar nomes sem ligar para espaços e maiúsculas). */
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Pessoa avulsa pelo nome: se já existe alguém com esse nome (avulsa ou não, mesmo arquivada), é a mesma
 * pessoa: assim "Fulano" de novo no mesmo mês não vira outro Fulano, e a dívida dele fica somada num lugar só.
 * Se não existe, cria como avulsa.
 */
export async function findOrCreateTempPerson(householdId: string, rawName: string) {
  const db = getDb();
  const name = rawName.trim().replace(/\s+/g, " ");
  const same = await db
    .select()
    .from(p)
    .where(and(eq(p.householdId, householdId), sql`lower(regexp_replace(trim(${p.name}), '\\s+', ' ', 'g')) = ${norm(name)}`));
  // Preferência: alguém da família (não avulso) ativo; depois a avulsa, mesmo arquivada (volta a aparecer).
  const pick = same.find((x) => !x.temporary && !x.archived) ?? same.find((x) => x.temporary) ?? same[0];
  // Se estava arquivada, volta às listas quando um lançamento com ela for salvo (reviveTemporary).
  if (pick) return { person: { ...pick, archived: pick.temporary ? false : pick.archived }, reused: true };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(p).where(eq(p.householdId, householdId));
  const [created] = await db
    .insert(p)
    .values({ householdId, name, color: PALETTE[n % PALETTE.length], temporary: true, sortOrder: 1000 + n })
    .returning();
  return { person: created, reused: false };
}

/** Pessoas avulsas arquivadas que entraram num lançamento novo voltam às listas. */
export async function reviveTemporary(householdId: string, ids: string[]) {
  if (ids.length === 0) return;
  await getDb()
    .update(p)
    .set({ archived: false })
    .where(and(eq(p.householdId, householdId), eq(p.temporary, true), eq(p.archived, true), inArray(p.id, ids)));
}

/**
 * Pessoas avulsas que já acertaram tudo (não devem e não têm a receber) e não têm nada para o futuro
 * saem das listas (ficam arquivadas, com o histórico). Roda junto com as recorrências.
 */
export async function archiveSettledTemporary(householdId: string) {
  const db = getDb();
  const temps = await db.select({ id: p.id }).from(p).where(and(eq(p.householdId, householdId), eq(p.temporary, true), eq(p.archived, false)));
  if (temps.length === 0) return 0;
  const today = todayIn();
  let archived = 0;
  for (const { id } of temps) {
    const rows = await db
      .select({ id: t.id, amountCents: t.amountCents, kind: t.kind, payerId: t.payerId, settled: t.settled, settlesId: t.settlesId, date: t.date })
      .from(t)
      .where(
        and(
          eq(t.householdId, householdId),
          or(eq(t.payerId, id), sql`exists (select 1 from "transaction_splits" s where s."transactionId" = ${t.id} and s."participantId" = ${id})`),
        ),
      );
    // Ainda não usada em nada (acabou de ser criada) ou com algo para o futuro: fica.
    if (rows.length === 0 || rows.some((r) => r.date > today)) continue;
    const splits = await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, rows.map((r) => r.id)));
    const net = computeBalances(rows.map((r) => ({ ...r, kind: r.kind as "expense", splits: splits.filter((s) => s.transactionId === r.id) }))).get(id) ?? 0;
    if (net === 0) {
      await db.update(p).set({ archived: true }).where(eq(p.id, id));
      archived++;
    }
  }
  return archived;
}
