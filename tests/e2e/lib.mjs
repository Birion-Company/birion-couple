// Testes de ponta a ponta do Birion Finance: rodam contra o app local (banco local) com contas de teste
// @e2e.test, que são apagadas no fim. Uso: npm run test:e2e (app ligado; BASE e NETLIFY_DB_URL do .env.local).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import pg from "pg";

const env = Object.fromEntries(
  (() => {
    try {
      return readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
        .split("\n")
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]);
    } catch {
      return [];
    }
  })(),
);
export const BASE = process.env.BASE ?? "http://localhost:3000";
export const db = new pg.Client({ connectionString: process.env.NETLIFY_DB_URL ?? env.NETLIFY_DB_URL });
export const T = Date.now();
export let browser;
let n = 0;

export async function start() {
  await db.connect();
  browser = await chromium.launch();
}
export const one = async (sql, args) => (await db.query(sql, args)).rows[0];

export async function signup(name, { verify = true } = {}) {
  const tag = `p${++n}x${T % 1000000}`;
  const c = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await c.addInitScript(() => localStorage.setItem("bf-tour-seen", "1"));
  const p = await c.newPage();
  p.on("dialog", (d) => d.accept());
  const email = `${tag}@e2e.test`;
  await p.goto(BASE + "/criar-conta");
  await p.getByLabel("Seu nome").fill(name);
  await p.getByLabel("Nome de usuário").fill(tag);
  await p.getByLabel("Seu e-mail").fill(email);
  await p.getByLabel(/Crie uma senha/).fill("senha-forte-123");
  await p.getByRole("button", { name: "Criar conta" }).click();
  await p.waitForURL("**/verificar-email**", { timeout: 60000 });
  if (verify) await db.query(`update users set "emailVerifiedAt"=now(), "tourSeenAt"=now() where email=$1`, [email]);
  const u = await one(`select u.id, m."householdId" h, m."participantId" pid from users u join memberships m on m."userId"=u.id where u.email=$1`, [email]);
  return { p, email, ...u };
}
export async function join(owner, member) {
  const code = "e2e" + Math.random().toString(36).slice(2, 12);
  await db.query(`insert into invites ("householdId", code, role, "createdBy", "expiresAt") values ($1,$2,'member',$3, now() + interval '1 day')`, [owner.h, code, owner.id]);
  await member.p.goto(BASE + `/convite/${code}`);
  await member.p.getByRole("button", { name: "Aceitar e entrar" }).click();
  await member.p.waitForURL("**/painel**", { timeout: 60000 });
  Object.assign(member, await one(`select m."householdId" h, m."participantId" pid from memberships m where m."userId"=$1`, [member.id]));
}
export const contact = (owner, name) =>
  one(`insert into participants ("householdId", name, color, "ownerUserId") values ($1,$2,'#999999',$3) returning id`, [owner.h, name, owner.id]);
export async function expense(owner, desc, cents, splits, extra = {}) {
  const tx = await one(
    `insert into transactions ("householdId", date, description, "amountCents", kind, "payerId", source, "createdBy", "cardId") values ($1, coalesce($6::date, current_date), $2, $3, $7, $4, 'manual', $5, $8) returning id`,
    [owner.h, desc, cents, extra.payer ?? owner.pid, owner.id, extra.date ?? null, extra.kind ?? "expense", extra.cardId ?? null],
  );
  for (const [pid, a] of splits) await db.query(`insert into transaction_splits ("transactionId","participantId","amountCents") values ($1,$2,$3)`, [tx.id, pid, a]);
  return tx.id;
}
export async function payPart(owner, txId, fromPid, toPid, cents, closes) {
  const pay = await one(
    `insert into transactions ("householdId", date, description, "amountCents", kind, "payerId", "settlesId", source, "createdBy") values ($1, current_date, 'Pagamento', $2, 'transfer', $3, $4, 'manual', $5) returning id`,
    [owner.h, cents, fromPid, txId, owner.id],
  );
  await db.query(`insert into transaction_splits ("transactionId","participantId","amountCents") values ($1,$2,$3)`, [pay.id, toPid, cents]);
  if (closes) await db.query(`update transaction_splits set "paidById"=$1 where "transactionId"=$2 and "participantId"=$3`, [pay.id, txId, fromPid]);
  return pay.id;
}
export async function text(p, url) {
  await p.goto(BASE + url, { timeout: 60000 });
  await p.waitForTimeout(500);
  return (await p.locator("main").innerText()).replace(/\s+/g, " ");
}
export function expectEq(what, got, want) {
  if (got !== want) throw new Error(`${what}: esperado ${JSON.stringify(want)}, veio ${JSON.stringify(got)}`);
}
export async function cleanup() {
  await db.query(
    `with u as (select id from users where email like '%@e2e.test'), h as (delete from households where id in (select "householdId" from memberships where "userId" in (select id from u)) returning id) delete from users where id in (select id from u)`,
  );
  await browser?.close();
  await db.end();
}
