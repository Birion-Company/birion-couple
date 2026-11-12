// Dispara acessos simultâneos contra o app local (BASE, padrão http://localhost:3002) e mede p50/p95/p99 e erros.
// Uso: node tests/carga/rodar.mjs [rótulo]   (grava resultado-<rótulo>.json)
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { BASE, EMAIL, MEMBROS, SENHA } from "./comum.mjs";

const label = process.argv[2] ?? "teste";
const PAGES = [
  ["/painel", 30], ["/transacoes", 25], ["/transacoes?dividas=1", 15], ["/confirmar", 10], ["/api/notificacoes", 15], ["/cartoes", 3], ["/ajustes", 2],
];
const pick = () => { let r = Math.random() * 100; for (const [u, w] of PAGES) if ((r -= w) < 0) return u; return PAGES[0][0]; };

// 1) cookies: entra de verdade com cada conta (sem mexer em segredos)
const b = await chromium.launch();
const cookies = [];
for (let i = 0; i < MEMBROS; i++) {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto(BASE + "/entrar");
  await p.getByLabel("E-mail ou nome de usuário").fill(EMAIL(i)); await p.getByLabel("Sua senha").fill(SENHA);
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.waitForURL("**/painel**", { timeout: 120000 });
  const c = (await ctx.cookies()).find((x) => x.name === "bf_session");
  cookies.push(`bf_session=${c.value}`);
  await ctx.close();
}
await b.close();

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
async function hit(url, user) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + url, { headers: { cookie: cookies[user % MEMBROS] }, redirect: "manual" });
    await r.arrayBuffer();
    return { ms: performance.now() - t0, status: r.status };
  } catch (e) {
    return { ms: performance.now() - t0, status: "erro:" + (e.cause?.code ?? e.message) };
  }
}
const summarize = (rows) => {
  const by = {};
  for (const [u, r] of rows) (by[u] ??= []).push(r);
  const out = {};
  for (const [u, rs] of Object.entries(by)) {
    const ok = rs.filter((r) => r.status === 200).map((r) => r.ms);
    out[u] = { n: rs.length, erros: rs.length - ok.length, p50: Math.round(pct(ok, 50)), p95: Math.round(pct(ok, 95)), p99: Math.round(pct(ok, 99)), max: Math.round(Math.max(0, ...ok)) };
  }
  return out;
};
const show = (title, s) => {
  console.log(`\n${title}`);
  console.log("página".padEnd(26), "n".padStart(5), "erros".padStart(6), "p50".padStart(7), "p95".padStart(7), "p99".padStart(7), "max".padStart(7));
  for (const [u, v] of Object.entries(s)) console.log(u.padEnd(26), String(v.n).padStart(5), String(v.erros).padStart(6), `${v.p50}ms`.padStart(7), `${v.p95}ms`.padStart(7), `${v.p99}ms`.padStart(7), `${v.max}ms`.padStart(7));
};
const result = { label, quando: new Date().toISOString() };

// 2) uma página por vez, um usuário só (referência sem concorrência)
{
  for (const [u] of PAGES) await hit(u, 0); // aquece
  const rows = [];
  for (const [u] of PAGES) for (let i = 0; i < 12; i++) rows.push([u, await hit(u, i)]);
  result.sozinho = summarize(rows);
  show("Um acesso de cada vez (12 por página)", result.sozinho);
}
// 3) muitos ao mesmo tempo: cada usuário virtual abre páginas em sequência, sem parar, por 20 s
result.simultaneos = {};
for (const vus of [10, 25, 50]) {
  const rows = []; const end = Date.now() + 20000; const t0 = Date.now();
  await Promise.all(Array.from({ length: vus }, async (_, v) => { while (Date.now() < end) { const u = pick(); rows.push([u, await hit(u, v)]); } }));
  const total = rows.length, errs = rows.filter(([, r]) => r.status !== 200).length;
  const s = summarize(rows);
  s["TODAS"] = summarize(rows.map(([, r]) => ["TODAS", r]))["TODAS"];
  result.simultaneos[vus] = { rps: +(total / ((Date.now() - t0) / 1000)).toFixed(1), total, erros: errs, paginas: s };
  show(`${vus} usuários ao mesmo tempo por 20 s  (${result.simultaneos[vus].rps} pedidos/s, ${errs} erros de ${total})`, s);
  const tipos = {}; for (const [, r] of rows) if (r.status !== 200) tipos[r.status] = (tipos[r.status] ?? 0) + 1;
  if (errs) console.log("  tipos de erro:", JSON.stringify(tipos));
}
writeFileSync(new URL(`./resultado-${label}.json`, import.meta.url), JSON.stringify(result, null, 1));
console.log(`\nSalvo em tests/carga/resultado-${label}.json`);
