import { addMonthsIso, invoiceDates, invoiceOf, monthLabel, shortDate } from "./cards";
import { formatMoney, splitEqually } from "./money";

/**
 * "O que este lançamento muda": descreve, em frases, o efeito de um lançamento em cada parte do app,
 * seguindo as mesmas regras do cálculo de verdade (dívidas, faturas, painel, pendências).
 */
export type ImpactInput = {
  kind: "expense" | "income" | "loan" | "transfer";
  amountCents: number;
  payerId: string | null;
  /** Parte de cada pessoa no valor total. */
  shares: { participantId: string; cents: number }[];
  /** Pessoa de quem está vendo (para escrever "você"). */
  me: string | null;
  names: Record<string, string>;
  statusBehavior: "pending" | "open" | "settled" | null;
  card: { name: string; closingDay: number; dueDay: number } | null;
  date: string;
  repeat: "once" | "installment" | "monthly";
  /** Número de parcelas ou meses; nulo = todo mês, sem fim. */
  count: number | null;
  categoryName: string | null;
  currency?: string;
  /** Data de hoje (AAAA-MM-DD), para avisar quando a data é futura. */
  today: string;
};

export type ImpactArea = "debts" | "card" | "panel" | "pending";
export type Impact = { area: ImpactArea; title: string; lines: string[]; href: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function describeImpact(i: ImpactInput): Impact[] {
  const money = (c: number) => formatMoney(c, i.currency ?? "BRL");
  const who = (id: string | null) => (id === null ? "ninguém" : id === i.me ? "você" : i.names[id] ?? "alguém");
  const between = i.kind === "loan" || i.kind === "transfer";
  const series = i.repeat !== "once";
  const n = i.repeat === "installment" ? Math.max(1, i.count ?? 1) : 1;
  // Valor que conta a cada mês (parcela) ou o valor único.
  const perMonth = (cents: number) => (i.repeat === "installment" ? splitEqually(cents, n)[0] : cents);
  const when = i.repeat === "installment" ? " por parcela" : i.repeat === "monthly" ? " todo mês" : "";
  const out: Impact[] = [];

  // ---------- Dívidas ----------
  const debts: string[] = [];
  if (i.statusBehavior === "settled") {
    debts.push("Status “acertado”: não gera dívida.");
  } else if (!i.payerId) {
    debts.push("Sem “quem pagou”: não gera dívida até alguém pagar.");
  } else if (between) {
    const to = i.shares[0]?.participantId ?? null;
    if (to) {
      debts.push(
        i.kind === "loan"
          ? `${cap(who(to))} fica devendo ${money(i.amountCents)} para ${who(i.payerId)}.`
          : `Abate ${money(i.amountCents)} do que ${who(i.payerId)} deve para ${who(to)}.`,
      );
    }
  } else {
    const others = i.shares.filter((s) => s.participantId !== i.payerId && s.cents > 0);
    if (others.length === 0) {
      debts.push(`Só de ${who(i.payerId)}: não gera dívida.`);
    } else {
      for (const s of others.slice(0, 3)) {
        debts.push(
          i.kind === "income"
            ? `${cap(who(i.payerId))} fica devendo ${money(perMonth(s.cents))}${when} para ${who(s.participantId)} (parte dela).`
            : `${cap(who(s.participantId))} fica devendo ${money(perMonth(s.cents))}${when} para ${who(i.payerId)}.`,
        );
      }
      if (others.length > 3) debts.push(`E mais ${others.length - 3} pessoa(s).`);
      if (series) debts.push("Parcelas e meses futuros só viram dívida no mês de cada um.");
    }
  }
  if (debts.length) out.push({ area: "debts", title: "Dívidas", lines: debts, href: "/dividas" });

  // ---------- Fatura do cartão ----------
  if (i.card && !between && /^\d{4}-\d{2}-\d{2}$/.test(i.date)) {
    const first = invoiceOf(i.date, i.card.closingDay);
    const due = invoiceDates(first, i.card).due;
    const lines = [`Entra na fatura de ${monthLabel(first)} do ${i.card.name}, que vence ${shortDate(due)}.`];
    if (i.repeat === "installment" && n > 1) {
      const last = invoiceOf(addMonthsIso(i.date, n - 1), i.card.closingDay);
      lines[0] = `Uma parcela de ${money(perMonth(i.amountCents))} em cada fatura do ${i.card.name}, de ${monthLabel(first)} a ${monthLabel(last)}.`;
    } else if (i.repeat === "monthly") {
      lines[0] = `Entra em toda fatura do ${i.card.name} a partir de ${monthLabel(first)}.`;
    }
    const others = i.shares.filter((s) => s.participantId !== i.payerId && s.cents > 0);
    if (others.length && i.kind === "expense") {
      const parts = i.shares.filter((s) => s.cents > 0).map((s) => `${who(s.participantId)} ${money(perMonth(s.cents))}`);
      lines.push(`Na fatura, a parte de cada um${i.repeat === "installment" ? " por parcela" : ""}: ${parts.join(" · ")}.`);
    }
    out.push({ area: "card", title: "Fatura do cartão", lines, href: "/cartoes" });
  }

  // ---------- Painel ----------
  const month = /^\d{4}-\d{2}/.test(i.date) ? monthLabel(i.date.slice(0, 7)) : "";
  const panel: string[] = [];
  if (between) panel.push("Não conta como gasto nem como entrada: é dinheiro entre pessoas.");
  else if (i.kind === "expense") panel.push(`Soma em Gastos de ${month}${i.categoryName ? `, em ${i.categoryName}` : " (sem categoria)"}${series ? `, e nos meses seguintes` : ""}.`);
  else panel.push(`Soma em Entradas de ${month}${series ? " e dos meses seguintes" : ""}.`);
  if (i.date > i.today) panel.push("A data é futura: só aparece no painel quando o mês chegar.");
  out.push({ area: "panel", title: "Painel", lines: panel, href: "/painel" });

  // ---------- Pendências ----------
  if (i.kind === "expense" && i.statusBehavior === "pending") {
    out.push({ area: "pending", title: "Pendências", lines: ["Fica na lista de Pendências do painel até o status mudar para pago ou acertado."], href: "/painel" });
  }
  return out;
}
