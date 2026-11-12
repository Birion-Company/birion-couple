// Monta a família grande de teste (contas @carga.test). Rode `node tests/carga/limpar.mjs` para apagar.
import bcrypt from "bcryptjs";
import { connect, EMAIL, MEMBROS, SENHA } from "./comum.mjs";

const c = await connect();
const q = async (s, a) => (await c.query(s, a)).rows;
if ((await q(`select count(*)::int n from users where email like '%@carga.test'`))[0].n > 0) {
  console.log("Família de carga já existe (rode limpar.mjs para refazer).");
  await c.end();
  process.exit(0);
}
const hash = await bcrypt.hash(SENHA, 4);
const rnd = (n) => Math.floor(Math.random() * n);
const t0 = Date.now();
const [{ id: h }] = await q(`insert into households (name, "approvalsFrom") values ('Família Carga', now() - interval '400 days') returning id`);
const users = [], pids = [], contacts = [];
for (let i = 0; i < MEMBROS; i++) {
  const [u] = await q(`insert into users (email, name, username, "passwordHash", "emailVerifiedAt", "tourSeenAt") values ($1,$2,$3,$4,now(),now()) returning id`, [EMAIL(i), `Pessoa Carga ${i}`, `carga${i}`, hash]);
  const [p] = await q(`insert into participants ("householdId", name) values ($1,$2) returning id`, [h, `Pessoa Carga ${i}`]);
  await q(`insert into memberships ("householdId","userId",role,"participantId") values ($1,$2,$3,$4)`, [h, u.id, i === 0 ? "owner" : "member", p.id]);
  users.push(u.id); pids.push(p.id);
  const cs = await q(`insert into participants ("householdId", name, "ownerUserId") select $1, 'Contato ' || $2 || '-' || g, $3 from generate_series(1, 80) g returning id`, [h, i, u.id]);
  contacts.push(cs.map((x) => x.id));
}
const chunk = async (table, cols, rows, per = 1500) => {
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per);
    const ph = part.map((r, k) => `(${r.map((_, j) => `$${k * r.length + j + 1}`).join(",")})`).join(",");
    await c.query(`insert into ${table} (${cols}) values ${ph}`, part.flat());
  }
};
// 400 lançamentos por pessoa nos últimos 400 dias: divididos com 1 a 2 contatos dela
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const txRows = [], splitPlan = [];
let seq = 0;
for (let m = 0; m < MEMBROS; m++) for (let k = 0; k < 400; k++) {
  const id = crypto.randomUUID();
  const withs = [contacts[m][rnd(80)], ...(k % 3 === 0 ? [contacts[m][rnd(80)]] : [])].filter((x, i, a) => a.indexOf(x) === i);
  const parts = [pids[m], ...withs];
  const total = parts.length * (1000 + rnd(9000));
  txRows.push([id, h, day(rnd(400)), `Compra ${m}-${k}`, total, "expense", pids[m], "manual", users[m]]);
  splitPlan.push([id, parts, total / parts.length]);
  seq++;
}
// 300 compartilhadas entre membros (esperando aceitar)
for (let k = 0; k < 300; k++) {
  const a = rnd(MEMBROS), b = (a + 1 + rnd(MEMBROS - 1)) % MEMBROS;
  const id = crypto.randomUUID();
  txRows.push([id, h, day(rnd(200)), `Dividida ${a}-${b}-${k}`, 6000, "expense", pids[a], "manual", users[a]]);
  splitPlan.push([id, [pids[a], pids[b]], 3000]);
}
await chunk("transactions", `id, "householdId", date, description, "amountCents", kind, "payerId", source, "createdBy"`, txRows);
await chunk("transaction_splits", `"transactionId","participantId","amountCents"`, splitPlan.flatMap(([id, parts, each]) => parts.map((p) => [id, p, each])));
// quitados (pagamento ligado que fecha a parte) e parciais, só entre a pessoa e os contatos dela
const pay = [], close = [];
for (let i = 0; i < 1200; i++) {
  const [id, parts, each] = splitPlan[rnd(MEMBROS * 400)];
  const who = parts[1]; if (!who || who === parts[0]) continue;
  const owner = pids.indexOf(parts[0]); const payId = crypto.randomUUID();
  pay.push([payId, h, day(rnd(100)), "Pagamento", each, "transfer", who, "manual", users[owner], id]);
  close.push([payId, parts[0], each, id, who, i % 3 === 0]);
}
await chunk("transactions", `id, "householdId", date, description, "amountCents", kind, "payerId", source, "createdBy", "settlesId"`, pay);
await chunk("transaction_splits", `"transactionId","participantId","amountCents"`, close.map(([payId, to, each]) => [payId, to, each]));
for (const [payId, , , orig, who, closes] of close) if (closes) await c.query(`update transaction_splits set "paidById"=$1 where "transactionId"=$2 and "participantId"=$3`, [payId, orig, who]);
// histórico: 5000 atividades e 2000 linhas do registro da família
const acts = [];
for (let i = 0; i < 5000; i++) {
  const m = rnd(MEMBROS), ct = contacts[m][rnd(80)];
  acts.push([h, users[m], "created", JSON.stringify({ tx: { description: `Compra ${i}`, amountCents: 4000, kind: "expense", date: day(rnd(400)), payerId: pids[m], splits: [{ participantId: ct, amountCents: 4000 }] } }), JSON.stringify([pids[m], ct]), new Date(Date.now() - rnd(400) * 86400000)]);
}
await chunk("activities", `"householdId","actorUserId",action,data,audience,"createdAt"`, acts);
const logs = [];
for (let i = 0; i < 2000; i++) logs.push([h, users[rnd(MEMBROS)], `Pessoa Carga ${rnd(MEMBROS)}`, "invite", `Pessoa Carga ${i % 10} gerou um convite para alguém ${i}.`, new Date(Date.now() - rnd(400) * 86400000)]);
await chunk("family_log", `"householdId","actorUserId","actorName",action,text,"createdAt"`, logs);
const n = (await q(`select (select count(*) from transactions where "householdId"=$1) t, (select count(*) from participants where "householdId"=$1) p, (select count(*) from activities where "householdId"=$1) a`, [h]))[0];
console.log(`Família de carga pronta em ${Math.round((Date.now() - t0) / 1000)} s: ${n.t} lançamentos, ${n.p} pessoas, ${n.a} atividades.`);
await c.end();
