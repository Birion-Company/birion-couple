import "server-only";
import { and, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeBalances } from "./balances";
import { addDaysIso, todayIn } from "./cards";
import { CONTACT_IDLE_DAYS, CONTACTS_ACTIVE_MAX, CONTACTS_FULL_MESSAGE, CONTACTS_TOTAL_MAX, CONTACTS_TOTAL_MESSAGE, PALETTE } from "./defaults";
import { contactsCount } from "./household";

/**
 * Contatos: pessoas sem login (quem só divide conta, como Fulano). Aparecem nas listas enquanto estão
 * ativos (até CONTACTS_ACTIVE_MAX); quem fica parado e sem dívida sai sozinho e volta ao digitar o nome.
 * Membros (com login) nunca são escondidos daqui.
 */
const p = schema.participants;
const t = schema.transactions;

/** "  fulano  de tal " → "fulano de tal" (compara nomes sem ligar para espaços e maiúsculas). */
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Ids das pessoas com login (membros) da família, como subconsulta. */
const membersOf = (householdId: string) =>
  getDb()
    .select({ id: schema.memberships.participantId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.householdId, householdId), isNotNull(schema.memberships.participantId)));

/** Última data em que cada pessoa aparece num lançamento (como quem pagou ou com parte). Pode ser futura. */
export async function lastUsedByPerson(householdId: string) {
  const rows = await getDb().execute<{ pid: string; last: string }>(sql`
    select pid, max(d)::text as last from (
      select ${t.payerId} as pid, ${t.date} as d from ${t} where ${t.householdId} = ${householdId} and ${t.payerId} is not null
      union all
      select s."participantId" as pid, ${t.date} as d from "transaction_splits" s join ${t} on ${t.id} = s."transactionId" where ${t.householdId} = ${householdId}
    ) x group by pid`);
  return new Map(rows.rows.map((r) => [r.pid, r.last]));
}

/** Saldo de uma pessoa (positivo: tem a receber; negativo: deve). Zero: está quite com todo mundo. */
async function netOf(householdId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({ id: t.id, amountCents: t.amountCents, kind: t.kind, payerId: t.payerId, settled: t.settled, settlesId: t.settlesId })
    .from(t)
    .where(and(eq(t.householdId, householdId), or(eq(t.payerId, id), sql`exists (select 1 from "transaction_splits" s where s."transactionId" = ${t.id} and s."participantId" = ${id})`)));
  if (rows.length === 0) return 0;
  const splits = await db.select().from(schema.transactionSplits).where(inArray(schema.transactionSplits.transactionId, rows.map((r) => r.id)));
  return computeBalances(rows.map((r) => ({ ...r, kind: r.kind as "expense", splits: splits.filter((s) => s.transactionId === r.id) }))).get(id) ?? 0;
}

/** Contatos ativos que podem sair das listas: sem nada no futuro, quites, do usado há mais tempo ao mais recente. */
async function hideableContacts(householdId: string, usedBefore: string) {
  const db = getDb();
  const active = await db
    .select({ id: p.id, createdAt: p.createdAt })
    .from(p)
    .where(and(eq(p.householdId, householdId), eq(p.archived, false), notInArray(p.id, membersOf(householdId))));
  const last = await lastUsedByPerson(householdId);
  const lastOf = (x: { id: string; createdAt: Date }) => last.get(x.id) ?? x.createdAt.toISOString().slice(0, 10);
  return active.filter((x) => lastOf(x) < usedBefore).sort((a, b) => (lastOf(a) < lastOf(b) ? -1 : 1));
}

/**
 * Abre uma vaga entre os contatos ativos, se preciso: esconde o contato parado há mais tempo que já
 * está quite (nada some: ele volta ao digitar o nome). Sem ninguém para esconder, não há vaga.
 */
async function makeRoomForContact(householdId: string) {
  const { active } = await contactsCount(getDb(), householdId);
  if (active < CONTACTS_ACTIVE_MAX) return true;
  // Só quem não aparece em nada de hoje em diante (nem foi usado hoje).
  for (const c of await hideableContacts(householdId, todayIn())) {
    if ((await netOf(householdId, c.id)) === 0) {
      await getDb().update(p).set({ archived: true }).where(eq(p.id, c.id));
      return true;
    }
  }
  return false;
}

type Found = { ok: true; person: typeof p.$inferSelect; reused: boolean } | { ok: false; error: string };

/**
 * Pessoa pelo nome, para usar num lançamento. Se o nome já existe (membro ou contato, mesmo escondido),
 * é a mesma pessoa: "Fulano" de novo não vira outro Fulano. Se não existe, cria um contato.
 * Respeita os limites: até CONTACTS_ACTIVE_MAX ativos (abrindo vaga sozinho se der) e CONTACTS_TOTAL_MAX guardados.
 */
export async function findOrCreateContact(householdId: string, rawName: string): Promise<Found> {
  const db = getDb();
  const name = rawName.trim().replace(/\s+/g, " ");
  const same = await db
    .select()
    .from(p)
    .where(and(eq(p.householdId, householdId), sql`lower(regexp_replace(trim(${p.name}), '\\s+', ' ', 'g')) = ${norm(name)}`));
  // Preferência: alguém ativo; depois um escondido (volta para as listas).
  const pick = same.find((x) => !x.archived) ?? same[0];
  if (pick) {
    if (pick.archived) {
      if (!(await makeRoomForContact(householdId))) return { ok: false, error: CONTACTS_FULL_MESSAGE };
      await db.update(p).set({ archived: false, temporary: false }).where(eq(p.id, pick.id));
    }
    return { ok: true, person: { ...pick, archived: false }, reused: true };
  }
  const { total } = await contactsCount(db, householdId);
  if (total >= CONTACTS_TOTAL_MAX) return { ok: false, error: CONTACTS_TOTAL_MESSAGE };
  if (!(await makeRoomForContact(householdId))) return { ok: false, error: CONTACTS_FULL_MESSAGE };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(p).where(eq(p.householdId, householdId));
  const [created] = await db.insert(p).values({ householdId, name, color: PALETTE[n % PALETTE.length], sortOrder: 1000 + n }).returning();
  return { ok: true, person: created, reused: false };
}

/** Contatos escondidos que entraram num lançamento salvo voltam às listas. */
export async function reviveContacts(householdId: string, ids: string[]) {
  if (ids.length === 0) return;
  await getDb()
    .update(p)
    .set({ archived: false })
    .where(and(eq(p.householdId, householdId), eq(p.archived, true), inArray(p.id, ids), notInArray(p.id, membersOf(householdId))));
}

/**
 * Esconde os contatos parados: sem lançamento há CONTACT_IDLE_DAYS dias (nem no futuro) e quites.
 * Ficam guardados com o histórico e voltam ao digitar o nome. Roda junto com a manutenção da família.
 */
export async function hideIdleContacts(householdId: string) {
  const cutoff = addDaysIso(todayIn(), -CONTACT_IDLE_DAYS);
  let hidden = 0;
  for (const c of await hideableContacts(householdId, cutoff)) {
    if ((await netOf(householdId, c.id)) !== 0) continue;
    await getDb().update(p).set({ archived: true }).where(eq(p.id, c.id));
    hidden++;
  }
  return hidden;
}

/** Há vaga para ativar mais um contato (criar em Ajustes ou mostrar um escondido)? */
export async function hasRoomForContact(householdId: string, { creating = false } = {}) {
  const { active, total } = await contactsCount(getDb(), householdId);
  if (creating && total >= CONTACTS_TOTAL_MAX) return CONTACTS_TOTAL_MESSAGE;
  if (active >= CONTACTS_ACTIVE_MAX) return CONTACTS_FULL_MESSAGE;
  return null;
}
