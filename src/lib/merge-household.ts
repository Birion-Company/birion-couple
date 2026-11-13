import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "./leave";

/**
 * Regra principal do Birion: nunca perder dados (nem o acesso a eles).
 *
 * Quem aceita o convite do casal traz junto tudo o que tinha na própria família: lançamentos, parcelas e
 * contas fixas, cartões, contatos, categorias, projetos, regras, importações e histórico. Categorias,
 * projetos e status com o mesmo nome dos do casal viram um só; o resto entra como está.
 *
 * Tudo roda dentro da transação de quem chama: se qualquer conferência falhar, nada muda.
 * Só junta família de uma pessoa sozinha; se a família antiga tiver outra pessoa com login, recusa
 * (quem chama mostra a mensagem) para não levar os dados de mais ninguém.
 */
export class MergeBlocked extends Error {}

type Row = Record<string, unknown>;

async function rows(tx: Tx, q: ReturnType<typeof sql>): Promise<Row[]> {
  const res = (await tx.execute(q)) as unknown as [Row[]] | Row[];
  return (Array.isArray(res[0]) ? res[0] : res) as Row[];
}
const run = (tx: Tx, q: ReturnType<typeof sql>) => tx.execute(q);
const norm = (s: unknown) => String(s ?? "").trim().toLocaleLowerCase("pt-BR");

/** Junta a família `fromHid` (só desta pessoa) dentro de `toHid`. Devolve o participante da pessoa no casal. */
export async function bringHomeInto(
  tx: Tx,
  opts: { userId: string; fromHid: string; toHid: string; claimedPid: string | null },
): Promise<string> {
  const { userId, fromHid, toHid, claimedPid } = opts;
  if (fromHid === toHid) throw new MergeBlocked("Mesma família.");

  const members = await rows(tx, sql`select "userId", "participantId" from "memberships" where "householdId" = ${fromHid}`);
  if (members.some((m) => m.userId !== userId)) {
    throw new MergeBlocked("Você já divide as contas com outra pessoa. Desligue o modo casal antes de entrar em outro.");
  }
  const oldPid = (members.find((m) => m.userId === userId)?.participantId as string | null) ?? null;
  // A pessoa no casal: o contato que o convite indicou (com o histórico do casal) ou a própria pessoa antiga.
  const finalPid = claimedPid ?? oldPid;

  // ---- Categorias, projetos e status: mesmo nome vira um só; o resto entra como está.
  const mapByName = async (table: "categories" | "projects" | "statuses") => {
    const mine = await rows(tx, sql`select "id", "name" from ${sql.identifier(table)} where "householdId" = ${fromHid}`);
    const theirs = await rows(tx, sql`select "id", "name" from ${sql.identifier(table)} where "householdId" = ${toHid}`);
    const byName = new Map(theirs.map((r) => [norm(r.name), r.id as string]));
    const map = new Map<string, string>();
    for (const r of mine) {
      const same = byName.get(norm(r.name));
      if (same) map.set(r.id as string, same);
    }
    return map;
  };
  const cat = await mapByName("categories");
  const proj = await mapByName("projects");
  const stat = await mapByName("statuses");

  const remapCol = async (table: string, col: string, map: Map<string, string>, where: ReturnType<typeof sql>) => {
    for (const [from, to] of map) {
      await run(tx, sql`update ${sql.identifier(table)} set ${sql.identifier(col)} = ${to} where ${sql.identifier(col)} = ${from} and ${where}`);
    }
  };
  const inFrom = sql`"householdId" = ${fromHid}`;

  // ---- Lançamentos
  await remapCol("transactions", "categoryId", cat, inFrom);
  await remapCol("transactions", "projectId", proj, inFrom);
  await remapCol("transactions", "statusId", stat, inFrom);
  // Mesmo extrato importado nas duas famílias: o código externo não pode repetir no casal.
  const clash = await rows(
    tx,
    sql`select a."id" from "transactions" a join "transactions" b on b."externalId" = a."externalId" and b."householdId" = ${toHid} where a."householdId" = ${fromHid} and a."externalId" is not null`,
  );
  for (const r of clash) await run(tx, sql`update "transactions" set "externalId" = concat("externalId", '#', left("id", 8)) where "id" = ${r.id as string}`);

  // ---- Séries (parcelado / todo mês) e regras
  await remapCol("recurring_series", "categoryId", cat, inFrom);
  await remapCol("recurring_series", "projectId", proj, inFrom);
  await remapCol("category_rules", "categoryId", cat, inFrom);
  for (const [from, to] of cat) {
    await run(tx, sql`update ignore "budgets" set "categoryId" = ${to} where "userId" = ${userId} and "categoryId" = ${from}`);
  }

  // ---- A pessoa: se o convite indicou um contato do casal, tudo que era da pessoa antiga passa para ele.
  if (oldPid && finalPid && oldPid !== finalPid) {
    const p = { from: oldPid, to: finalPid };
    await run(tx, sql`update "transactions" set "payerId" = ${p.to} where "payerId" = ${p.from} and ${inFrom}`);
    await run(tx, sql`update "transaction_splits" s join "transactions" t on t."id" = s."transactionId" set s."participantId" = ${p.to} where s."participantId" = ${p.from} and t."householdId" = ${fromHid}`);
    await run(tx, sql`update "recurring_series" set "payerId" = ${p.to} where "payerId" = ${p.from} and ${inFrom}`);
    await run(tx, sql`update "recurring_series" set "splits" = replace("splits", ${p.from}, ${p.to}) where ${inFrom}`);
    await run(tx, sql`update "credit_cards" set "ownerId" = ${p.to} where "ownerId" = ${p.from} and ${inFrom}`);
    await run(tx, sql`update "auto_accept_rules" set "participantId" = ${p.to} where "participantId" = ${p.from} and ${inFrom}`);
    await run(tx, sql`update "auto_accept_rules" set "fromParticipantId" = ${p.to} where "fromParticipantId" = ${p.from} and ${inFrom}`);
    await run(tx, sql`update ignore "tx_approvals" set "participantId" = ${p.to} where "participantId" = ${p.from} and ${inFrom}`);
    await run(tx, sql`update ignore "nicknames" set "participantId" = ${p.to} where "participantId" = ${p.from}`);
    await run(tx, sql`update "activities" set "audience" = replace("audience", ${p.from}, ${p.to}), "data" = replace("data", ${p.from}, ${p.to}) where ${inFrom}`);
  }

  // ---- Tudo o que é da família antiga passa para o casal.
  for (const table of [
    "transactions",
    "recurring_series",
    "credit_cards",
    "category_rules",
    "auto_accept_rules",
    "tx_approvals",
    "import_batches",
    "csv_presets",
    "activities",
    "family_log",
    "invite_requests",
  ]) {
    await run(tx, sql`update ${sql.identifier(table)} set "householdId" = ${toHid} where "householdId" = ${fromHid}`);
  }
  // Contatos (e a própria pessoa, se ela não assumiu um contato do casal).
  await run(tx, sql`update "participants" set "householdId" = ${toHid} where "householdId" = ${fromHid} and "id" <> ${oldPid && finalPid !== oldPid ? oldPid : ""}`);
  // Categorias, projetos e status sem par no casal entram; os repetidos já foram trocados.
  for (const [table, map] of [["categories", cat], ["projects", proj], ["statuses", stat]] as const) {
    const repeated = [...map.keys()];
    await run(
      tx,
      repeated.length
        ? sql`update ${sql.identifier(table)} set "householdId" = ${toHid} where "householdId" = ${fromHid} and "id" not in (${sql.join(repeated.map((x) => sql`${x}`), sql`, `)})`
        : sql`update ${sql.identifier(table)} set "householdId" = ${toHid} where "householdId" = ${fromHid}`,
    );
  }
  // Convites antigos não são dados da pessoa: perdem o sentido.
  await run(tx, sql`delete from "invites" where "householdId" = ${fromHid}`);

  // ---- Conferência: não pode sobrar nada da pessoa na família antiga.
  for (const table of ["transactions", "recurring_series", "credit_cards", "import_batches", "activities"]) {
    const [r] = await rows(tx, sql`select count(*) as n from ${sql.identifier(table)} where "householdId" = ${fromHid}`);
    if (Number(r?.n ?? 0) > 0) throw new Error(`Junção incompleta em ${table}; nada foi alterado.`);
  }
  if (oldPid && finalPid !== oldPid) {
    const [refs] = await rows(
      tx,
      sql`select (select count(*) from "transactions" where "payerId" = ${oldPid}) + (select count(*) from "transaction_splits" where "participantId" = ${oldPid}) as n`,
    );
    if (Number(refs?.n ?? 0) > 0) throw new Error("A pessoa antiga ainda tem lançamentos; nada foi alterado.");
  }
  // A família antiga fica vazia: sai a inscrição e a família.
  await run(tx, sql`delete from "memberships" where "householdId" = ${fromHid}`);
  await run(tx, sql`delete from "households" where "id" = ${fromHid}`);
  return finalPid ?? "";
}
