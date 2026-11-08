"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Repeat } from "lucide-react";
import { stopRecurring } from "@/app/actions/transactions";
import { addMonthsIso } from "@/lib/cards";
import { formatMoney } from "@/lib/money";
import { toastResult } from "./toaster";
import { formatDate } from "./ui";

export type RecurringItem = { id: string; description: string; amountCents: number; kind: string; startDate: string; nextIndex: number };

const KIND: Record<string, string> = { expense: "despesa", income: "receita" };

/** Lista dos lançamentos que se repetem todo mês, com o botão para parar. */
export function RecurringList({ items, currency }: { items: RecurringItem[]; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (items.length === 0) return null;
  return (
    <section className="card section recurring" aria-labelledby="repetem">
      <h2 id="repetem">
        <Repeat size={16} strokeWidth={1.8} aria-hidden /> Repetem todo mês
      </h2>
      <div className="rows">
        {items.map((r) => {
          const next = addMonthsIso(r.startDate, r.nextIndex - 1);
          return (
            <div key={r.id} className="row">
              <div className="grow">
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
    </section>
  );
}
