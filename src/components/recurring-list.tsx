"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, Repeat } from "lucide-react";
import { stopRecurring } from "@/app/actions/transactions";
import { addMonthsIso } from "@/lib/cards";
import { formatMoney } from "@/lib/money";
import { toastResult } from "./toaster";
import { formatDate } from "./ui";

export type RecurringItem = { id: string; description: string; amountCents: number; kind: string; startDate: string; nextIndex: number };

const KIND: Record<string, string> = { expense: "despesa", income: "receita" };

/** Contas fixas (cadastradas como "Todo mês"): bloco recolhível com o botão para parar cada uma. */
export function RecurringList({ items, currency }: { items: RecurringItem[]; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (items.length === 0) return null;
  const perMonth = items.filter((r) => r.kind === "expense").reduce((a, r) => a + r.amountCents, 0);
  return (
    <details className="card fixed-bills">
      <summary>
        <Repeat size={16} strokeWidth={1.8} aria-hidden />
        <span className="grow">
          <strong>Contas fixas</strong>
          <span className="faint">
            {" "}· {items.length} {items.length === 1 ? "cadastrada" : "cadastradas"}
            {perMonth > 0 ? ` · ${formatMoney(perMonth, currency)} por mês` : ""}
          </span>
        </span>
        <ChevronDown size={16} strokeWidth={1.8} className="impact-chevron" aria-hidden />
      </summary>
      <div className="rows">
        {items.map((r) => {
          const next = addMonthsIso(r.startDate, r.nextIndex - 1);
          return (
            <div key={r.id} className="row fixed-bill">
              <div className="grow fixed-bill-text">
                <p className="title">{r.description}</p>
                <p className="sub">
                  {KIND[r.kind] ?? "lançamento"} todo dia {Number(r.startDate.slice(8, 10))} · próximo em{" "}
                  {formatDate(next, { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              <span className={`amount ${r.kind === "income" ? "pos" : ""}`}>{formatMoney(r.amountCents, currency)}</span>
              <button
                type="button"
                className="btn small ghost danger"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Parar de repetir "${r.description}"? Os meses que já passaram continuam.`)) return;
                  start(async () => {
                    const res = await stopRecurring(r.id);
                    toastResult(res);
                    if (res.ok) router.refresh();
                  });
                }}
              >
                Parar de repetir
              </button>
            </div>
          );
        })}
      </div>
    </details>
  );
}
