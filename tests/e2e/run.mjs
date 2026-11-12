// Cenários das ações de dinheiro (cada um saiu de um erro real). Cada cenário lança erro se o resultado mudar.
import { BASE, contact, expense, expectEq, join, one, payPart, signup, start, text, cleanup, db } from "./lib.mjs";

const money = (t, re) => t.match(re)?.[1] ?? null;
const scenarios = {
  async "mudar o valor depois de pago reabre a diferença"() {
    const ana = await signup("Ana E2E");
    const ze = await contact(ana, "Zé E2E");
    const tx = await expense(ana, "Mercado", 10000, [[ana.pid, 5000], [ze.id, 5000]]);
    await payPart(ana, tx, ze.id, ana.pid, 5000, true);
    await ana.p.goto(BASE + `/transacoes/${tx}`);
    await ana.p.locator('input[inputmode="decimal"]').first().fill("200,00");
    await ana.p.getByRole("button", { name: "Salvar", exact: true }).click();
    await ana.p.waitForTimeout(1500);
    expectEq("Zé deve", money(await text(ana.p, "/transacoes?dividas=1"), /Zé E2E te deve R\$ ([\d.,]+)/), "50,00");
  },
  async "pagamento parcial no painel bate com Dívidas"() {
    const ana = await signup("Ana E2E");
    const ze = await contact(ana, "Zé E2E");
    const tx = await expense(ana, "Jantar", 30000, [[ana.pid, 10000], [ze.id, 20000]]);
    await payPart(ana, tx, ze.id, ana.pid, 15000, false);
    expectEq("painel vendo o Zé", money(await text(ana.p, `/painel?pessoa=${ze.id}`), /Falta Zé E2E pagar R\$ ([\d.,]+)/), "50,00");
    expectEq("Dívidas", money(await text(ana.p, "/transacoes?dividas=1"), /Zé E2E te deve R\$ ([\d.,]+)/), "50,00");
  },
  async "recusado não conta como gasto; aceitar vários conta"() {
    const ana = await signup("Ana E2E");
    const bob = await signup("Bob E2E");
    await join(ana, bob);
    await expense(ana, "Viagem", 80000, [[bob.pid, 80000]]);
    await expense(ana, "Hotel", 20000, [[bob.pid, 20000]]);
    const gasto = async () => money(await text(bob.p, "/painel"), /Gastos por categoria R\$ ([\d.,]+)/);
    expectEq("antes de aceitar", await gasto(), "0,00");
    await bob.p.goto(BASE + "/confirmar");
    await bob.p.getByLabel("Selecionar todos").check();
    await bob.p.getByRole("button", { name: /Aceitar 2 selecionados/ }).click();
    await bob.p.waitForTimeout(2000);
    expectEq("depois de aceitar os 2", await gasto(), "1.000,00");
  },
  async "estorno de fatura fechada vira crédito na aberta"() {
    const ana = await signup("Ana E2E");
    const ze = await contact(ana, "Zé E2E");
    const card = await one(`insert into credit_cards ("householdId", name, "closingDay", "dueDay", "ownerId") values ($1,'Cartão',5,12,$2) returning id`, [ana.h, ana.pid]);
    const old = await expense(ana, "TV", 10000, [[ana.pid, 5000], [ze.id, 5000]], { cardId: card.id, date: new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 10) });
    await ana.p.goto(BASE + `/transacoes/${old}`);
    await ana.p.getByRole("button", { name: "Estorno" }).click();
    await ana.p.getByLabel("Valor do estorno").fill("40,00");
    await ana.p.locator(".refund-panel").getByRole("button", { name: "Confirmar" }).click();
    await ana.p.waitForTimeout(1500);
    expectEq("compra antiga", (await one(`select "amountCents" a from transactions where id=$1`, [old])).a, 10000);
    expectEq("crédito", (await one(`select "amountCents" a from transactions where description='Estorno: TV' and "householdId"=$1`, [ana.h]))?.a, 4000);
    expectEq("Zé deve", money(await text(ana.p, "/transacoes?dividas=1"), /Zé E2E te deve R\$ ([\d.,]+)/), "30,00");
  },
  async "conta sem e-mail confirmado não usa a API"() {
    const a = await signup("Ana E2E", { verify: false });
    expectEq("notificações", (await a.p.request.get(BASE + "/api/notificacoes")).status(), 401);
  },
  async "login espera depois de 5 senhas erradas"() {
    const a = await signup("Ana E2E");
    const p = a.p;
    await p.context().clearCookies();
    const tryLogin = async (pw) => {
      await p.goto(BASE + "/entrar");
      await p.getByLabel("E-mail ou nome de usuário").fill(a.email);
      await p.getByLabel("Sua senha").fill(pw);
      await p.getByRole("button", { name: "Entrar" }).click();
      await p.waitForTimeout(1200);
      return new URL(p.url()).pathname;
    };
    for (let i = 0; i < 5; i++) await tryLogin("errada-123");
    expectEq("6ª com a senha certa", await tryLogin("senha-forte-123"), "/entrar");
    await db.query(`delete from login_failures where email=$1`, [a.email]);
  },
};

await start();
let failed = 0;
const only = process.argv[2];
for (const [name, fn] of Object.entries(scenarios)) {
  if (only && !name.includes(only)) continue;
  const t0 = Date.now();
  try {
    await fn();
    console.log(`✓ ${name} (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${e.message.split("\n")[0]}`);
  }
}
await cleanup();
console.log(failed ? `${failed} falharam` : "todos passaram");
process.exit(failed ? 1 : 0);
