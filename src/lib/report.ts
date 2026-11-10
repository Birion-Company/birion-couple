import "server-only";
import type { AuthContext } from "./auth";
import { getInvoicesDue } from "./card-queries";
import { longMonth, todayIn } from "./cards";
import { parseFilters } from "./filters";
import { formatMoney } from "./money";
import {
  getDashboard,
  getDebtLedger,
  getLookupsFor,
  getMonthDebts,
  listTransactions,
  projectedForMonth,
  type DebtItem,
} from "./queries";
import { stateLabel, txState } from "./tx-state";

/**
 * Relatório de um mês (Ajustes → Exportação): os mesmos números do painel, organizados como um
 * extrato. Usado pela planilha (.xlsx) e pela versão para imprimir/salvar em PDF.
 */
export type MonthReport = Awaited<ReturnType<typeof getMonthReport>>;

const KIND: Record<string, string> = {
  expense: "Despesa",
  income: "Receita",
  loan: "Dívida",
  transfer: "Acerto",
};

export async function getMonthReport(auth: AuthContext, month: string) {
  const me = auth.participantId;
  const filters = parseFilters({ mes: month }, "mes");
  const mine = { ...filters, person: me };
  // Tudo calculado na hora do download (nada fica guardado pronto).
  const [lookups, list, dash, invoices, ledger, projected] = await Promise.all([
    getLookupsFor(auth),
    listTransactions(auth, filters, 5000),
    getDashboard(auth, mine),
    getInvoicesDue(auth, month, null),
    getDebtLedger(auth, await getLookupsFor(auth)),
    projectedForMonth(auth, month),
  ]);
  const current = todayIn().slice(0, 7);
  // Mês à frente: só o que é daquele mês (estimativa); senão, tudo o que está em aberto. Com o "de quê".
  const debts: { id: string; net: number; items: DebtItem[] }[] =
    month > current
      ? await getMonthDebts(auth, month)
      : ledger.people.map((p) => ({
          id: p.personId,
          net: p.net,
          items: p.entries.map((e) => ({
            description: e.tx.description,
            date: e.tx.date,
            cents: e.effect - (e.covered ?? 0) * Math.sign(e.effect),
          })),
        }));
  const name = (id: string | null) =>
    !id
      ? "—"
      : id === me
        ? "Você"
        : (lookups.participants.find((p) => p.id === id)?.name ?? "Alguém");
  const cat = (id: string | null) =>
    id
      ? (lookups.categories.find((c) => c.id === id)?.name ?? "—")
      : "Sem categoria";
  const card = (id: string | null) =>
    id ? (lookups.cards.find((c) => c.id === id)?.name ?? "—") : "";

  // Contas "todo mês" previstas também entram (num mês à frente elas ainda não foram lançadas).
  const rows = [...list.rows, ...projected]
    .filter((r) => !r.settlesId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((r) => {
      const myShare = me
        ? (r.splits.find((s) => s.participantId === me)?.amountCents ?? 0)
        : 0;
      const others = r.splits.filter(
        (s) => s.participantId !== r.payerId && s.amountCents > 0,
      );
      return {
        // Contas "todo mês" (sem fim) vão para uma lista própria, "Recorrentes", acima dos lançamentos.
        recurring: r.seriesKind === "monthly" && !r.seriesTotal,
        date: r.date,
        description: r.description,
        kind: KIND[r.kind] ?? r.kind,
        category: r.kind === "expense" ? cat(r.categoryId) : "",
        card: card(r.cardId),
        payer: name(r.payerId),
        series: r.seriesId
          ? r.seriesKind === "monthly"
            ? r.source === "projetado"
              ? "Todo mês (previsto)"
              : "Todo mês"
            : `${r.seriesIndex}/${r.seriesTotal}`
          : "",
        /** +1 entrada (receita), −1 saída (despesa), 0 dívida/acerto (só move entre pessoas). */
        sign: r.kind === "income" ? 1 : r.kind === "expense" ? -1 : 0,
        totalCents: r.amountCents,
        myShareCents: myShare,
        people: r.splits
          .filter((s) => s.amountCents > 0)
          .map(
            (s) =>
              `${name(s.participantId)} ${formatMoney(s.amountCents, auth.currency)}`,
          )
          .join(", "),
        owing: others
          .filter((s) => !s.paidById)
          .map(
            (s) =>
              `${name(s.participantId)} ${formatMoney(s.amountCents - (s.partCents ?? 0), auth.currency)}`,
          )
          .join(", "),
        status: stateLabel(txState(r), r.kind),
      };
    });

  const byCategory = dash.byCategory.map((c) => ({
    name: cat(c.id === "sem" ? null : c.id),
    cents: c.cents,
  }));
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
      // Receitas ainda não recebidas (ex.: a bolsa do mês à frente): aparecem como "a receber".
      toReceiveCents: rows
        .filter((x) => x.sign > 0 && x.status === "A receber")
        .reduce((a, x) => a + x.myShareCents, 0),
      invoicesCents: invoices
        .filter((v) => !v.paid)
        .reduce((a, v) => a + v.totalCents, 0),
      invoicesMineCents: invoices
        .filter((v) => !v.paid)
        .reduce((a, v) => a + v.mineCents, 0),
      owedToMeCents: debts
        .filter((d) => d.net > 0)
        .reduce((a, d) => a + d.net, 0),
      iOweCents: debts.filter((d) => d.net < 0).reduce((a, d) => a - d.net, 0),
      count: rows.length,
    },
    invoices: invoices.map((v) => ({
      card: v.cardName,
      due: v.due,
      totalCents: v.totalCents,
      mineCents: v.mineCents,
      paid: v.paid,
    })),
    byCategory: byCategory.map((c) => ({
      ...c,
      pct: spent ? c.cents / spent : 0,
    })),
    debts: debts
      .filter((d) => d.net !== 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .map((d) => ({
        name: name(d.id),
        cents: Math.abs(d.net),
        direction: d.net > 0 ? ("te deve" as const) : ("você deve" as const),
        // De quê: "Aluguel (05/12) R$ 500,00" — do que deve para o que abate.
        items: d.items
          .filter((x) => x.cents !== 0)
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((x) => ({
            description: x.description,
            date: x.date,
            cents: x.cents, // + a pessoa te deve; − você deve a ela (ou abate)
            projected: !!x.projected,
          })),
      })),
    recurring: rows.filter((x) => x.recurring),
    rows: rows.filter((x) => !x.recurring),
  };
}

/** Nome dos arquivos exportados: "Birion - Relatório da fatura de novembro de 2026". */
export function reportFileName(title: string) {
  return `Birion - Relatório da fatura ${title.replace(/^Extrato /, "")}`;
}
/** Mesmo nome sem acentos (para o cabeçalho de download em navegadores antigos). */
export function asciiName(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w .-]/g, "");
}
