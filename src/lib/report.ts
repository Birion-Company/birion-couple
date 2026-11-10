import "server-only";
import type { AuthContext } from "./auth";
import { getInvoicesDue } from "./card-queries";
import { longMonth, todayIn } from "./cards";
import { parseFilters } from "./filters";
import { formatMoney } from "./money";
import { getDashboard, getDebtLedger, getLookupsFor, getMonthDebts, listTransactions } from "./queries";
import { stateLabel, txState } from "./tx-state";

/**
 * Relatório de um mês (Ajustes → Exportação): os mesmos números do painel, organizados como um
 * extrato. Usado pela planilha (.xlsx) e pela versão para imprimir/salvar em PDF.
 */
export type MonthReport = Awaited<ReturnType<typeof getMonthReport>>;

const KIND: Record<string, string> = { expense: "Despesa", income: "Receita", loan: "Dívida", transfer: "Acerto" };

export async function getMonthReport(auth: AuthContext, month: string) {
  const me = auth.participantId;
  const filters = parseFilters({ mes: month }, "mes");
  const mine = { ...filters, person: me };
  const [lookups, list, dash, invoices, ledger] = await Promise.all([
    getLookupsFor(auth),
    listTransactions(auth, filters, 5000),
    getDashboard(auth, mine),
    getInvoicesDue(auth, month, null),
    getDebtLedger(auth, await getLookupsFor(auth)),
  ]);
  const current = todayIn().slice(0, 7);
  // Mês à frente: só o que é daquele mês (estimativa); senão, tudo o que está em aberto.
  const debts = month > current ? await getMonthDebts(auth, month) : ledger.people.map((p) => ({ id: p.personId, net: p.net }));
  const name = (id: string | null) => (!id ? "—" : id === me ? "Você" : lookups.participants.find((p) => p.id === id)?.name ?? "Alguém");
  const cat = (id: string | null) => (id ? lookups.categories.find((c) => c.id === id)?.name ?? "—" : "Sem categoria");
  const card = (id: string | null) => (id ? lookups.cards.find((c) => c.id === id)?.name ?? "—" : "");

  const rows = list.rows
    .filter((r) => !r.settlesId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((r) => {
      const myShare = me ? r.splits.find((s) => s.participantId === me)?.amountCents ?? 0 : 0;
      const others = r.splits.filter((s) => s.participantId !== r.payerId && s.amountCents > 0);
      return {
        date: r.date,
        description: r.description,
        kind: KIND[r.kind] ?? r.kind,
        category: r.kind === "expense" ? cat(r.categoryId) : "",
        card: card(r.cardId),
        payer: name(r.payerId),
        series: r.seriesId ? (r.seriesKind === "monthly" ? "Todo mês" : `${r.seriesIndex}/${r.seriesTotal}`) : "",
        totalCents: r.amountCents,
        myShareCents: myShare,
        people: r.splits.filter((s) => s.amountCents > 0).map((s) => `${name(s.participantId)} ${formatMoney(s.amountCents, auth.currency)}`).join(", "),
        owing: others.filter((s) => !s.paidById).map((s) => `${name(s.participantId)} ${formatMoney(s.amountCents - (s.partCents ?? 0), auth.currency)}`).join(", "),
        status: stateLabel(txState(r), r.kind),
      };
    });

  const byCategory = dash.byCategory.map((c) => ({ name: cat(c.id === "sem" ? null : c.id), cents: c.cents }));
  const spent = byCategory.reduce((a, c) => a + c.cents, 0);
  return {
    month,
    title: `Extrato de ${longMonth(month).toLowerCase()}`,
    family: auth.householdName,
    person: auth.userName,
    currency: auth.currency,
    generatedAt: new Date(),
    estimate: month > current,
    summary: {
      spentCents: spent,
      incomeCents: dash.income,
      invoicesCents: invoices.filter((v) => !v.paid).reduce((a, v) => a + v.totalCents, 0),
      invoicesMineCents: invoices.filter((v) => !v.paid).reduce((a, v) => a + v.mineCents, 0),
      owedToMeCents: debts.filter((d) => d.net > 0).reduce((a, d) => a + d.net, 0),
      iOweCents: debts.filter((d) => d.net < 0).reduce((a, d) => a - d.net, 0),
      count: rows.length,
    },
    invoices: invoices.map((v) => ({ card: v.cardName, due: v.due, totalCents: v.totalCents, mineCents: v.mineCents, paid: v.paid })),
    byCategory: byCategory.map((c) => ({ ...c, pct: spent ? c.cents / spent : 0 })),
    debts: debts
      .filter((d) => d.net !== 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .map((d) => ({ name: name(d.id), cents: Math.abs(d.net), direction: d.net > 0 ? ("te deve" as const) : ("você deve" as const) })),
    rows,
  };
}
