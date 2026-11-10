import Link from "next/link";
import { filtersToQuery, type Filters } from "@/lib/filters";
import { formatMoney } from "@/lib/money";
import { longMonth } from "@/lib/cards";

type Month = { key: string; cents: number; recurringCents: number; count: number };

const shortMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
};

/**
 * "Os próximos 12 meses": uma barra por mês com o que já está comprometido (parcelas, contas fixas
 * cadastradas como "Todo mês" e o que já foi lançado com data futura). Clicar leva ao mês.
 */
export function MonthOutlook({ months, selected, current, filters, currency }: { months: Month[]; selected: string; current: string; filters: Filters; currency: string }) {
  const money = (c: number) => formatMoney(c, currency);
  const max = Math.max(1, ...months.map((m) => m.cents));

  return (
    <section className="card section outlook" aria-labelledby="outlook-title" data-tour="dash-outlook">
      <div className="card-head">
        <h2 id="outlook-title">Os próximos 12 meses</h2>
      </div>
      <p className="faint outlook-help">
        Parcelas e contas fixas já lançadas. Toque num mês.
      </p>
      <div className="outlook-bars" role="list">
        {months.map((m) => {
          const h = Math.max(2, Math.round((m.cents / max) * 100));
          const isSel = m.key === selected;
          const label = `${longMonth(m.key)}: ${money(m.cents)}${m.recurringCents ? `, sendo ${money(m.recurringCents)} de contas fixas` : ""}${m.key === current ? " (este mês)" : ""}`;
          return (
            <Link
              key={m.key}
              role="listitem"
              href={`/painel${filtersToQuery({ ...filters, month: m.key === current ? null : m.key, period: "mes" }, "mes")}`}
              className={`outlook-col ${isSel ? "selected" : ""} ${m.key === current ? "current" : ""}`}
              aria-label={label}
              aria-current={isSel ? "true" : undefined}
              scroll={false}
            >
              <span className="outlook-tip" aria-hidden>
                <strong>{longMonth(m.key)}</strong>
                <span>{money(m.cents)}</span>
                {m.recurringCents > 0 && <span className="faint">{money(m.recurringCents)} de contas fixas</span>}
              </span>
              <span className="outlook-value" aria-hidden>
                {isSel ? money(m.cents).replace(/,\d{2}$/, "") : ""}
              </span>
              <span className="outlook-track" aria-hidden>
                <span className="outlook-bar" style={{ height: `${h}%` }} />
              </span>
              <span className="outlook-month" aria-hidden>
                {shortMonth(m.key)}
                {m.key.endsWith("-01") || m.key === current ? <span className="outlook-year">{m.key.slice(2, 4)}</span> : null}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
