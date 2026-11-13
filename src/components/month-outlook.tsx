import Link from "next/link";
import { filtersToQuery, type Filters } from "@/lib/filters";
import { formatMoney } from "@/lib/money";
import { longMonth } from "@/lib/cards";

type Month = { key: string; cents: number; recurringCents: number; count: number };

const shortMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
};

/** Topo "redondo" do eixo: 1, 2, 2,5 ou 5 × 10ⁿ acima do maior mês (R$ 1.840 → R$ 2.000). */
function niceMax(cents: number) {
  if (cents <= 0) return 100_00;
  const p = 10 ** Math.floor(Math.log10(cents));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= cents) return f * p;
  return 10 * p;
}

/**
 * "Os próximos 12 meses": uma barra por mês com o que já está comprometido, dividida em
 * contas fixas ("Todo mês") e parcelas/lançamentos com data futura. Linhas de grade discretas,
 * a média tracejada e o detalhe de cada mês ao passar o dedo. Clicar leva ao mês.
 */
export function MonthOutlook({ months, selected, current, filters, currency }: { months: Month[]; selected: string; current: string; filters: Filters; currency: string }) {
  const money = (c: number) => formatMoney(c, currency);
  // Abaixo de R$ 100 mostra os centavos (R$ 5,80 não vira "R$ 6"); acima, o valor curto (R$ 1,2 mil).
  const compact = (c: number) =>
    c < 100_00
      ? money(c)
      : new Intl.NumberFormat("pt-BR", { style: "currency", currency, notation: "compact", maximumFractionDigits: c >= 100_000 ? 1 : 0 }).format(c / 100);
  const top = niceMax(Math.max(0, ...months.map((m) => m.cents)));
  const pct = (c: number) => (c / top) * 100;
  const withValue = months.filter((m) => m.cents > 0);
  const avg = withValue.length ? Math.round(withValue.reduce((a, m) => a + m.cents, 0) / withValue.length) : 0;
  const hasFixed = months.some((m) => m.recurringCents > 0);
  const hasOther = months.some((m) => m.cents - m.recurringCents > 0);

  return (
    <section className="card section outlook" aria-labelledby="outlook-title" data-tour="dash-outlook">
      <div className="card-head">
        <h2 id="outlook-title">Os próximos 12 meses</h2>
        {(hasFixed || hasOther) && (
          <span className="outlook-legend" aria-label="Legenda">
            {hasOther && (
              <span>
                <i className="sw other" aria-hidden /> Parcelas e outros
              </span>
            )}
            {hasFixed && (
              <span>
                <i className="sw fixed" aria-hidden /> Contas fixas
              </span>
            )}
          </span>
        )}
      </div>
      <p className="faint outlook-help">Já comprometido em cada mês.</p>
      <div className="outlook-bars" role="list">
        {/* Grade: metade e topo do eixo, mais a média tracejada. Fica atrás das barras e rola junto. */}
        <div className="outlook-grid" aria-hidden>
          {[top, top / 2].map((v) => (
            <span key={v} className="outlook-gridline" style={{ bottom: `${pct(v)}%` }}>
              <span className="outlook-gridlabel">{compact(v)}</span>
            </span>
          ))}
          <span className="outlook-gridline base" style={{ bottom: 0 }} />
          {avg > 0 && withValue.length > 1 && (
            <span className="outlook-gridline avg" style={{ bottom: `${pct(avg)}%` }}>
              <span className="outlook-gridlabel avg">média {compact(avg)}</span>
            </span>
          )}
        </div>
        {months.map((m, i) => {
          const other = Math.max(0, m.cents - m.recurringCents);
          const isSel = m.key === selected;
          const isNow = m.key === current;
          const label = `${longMonth(m.key)}${isNow ? " (este mês)" : ""}: ${money(m.cents)}${m.recurringCents ? `, sendo ${money(m.recurringCents)} de contas fixas e ${money(other)} de parcelas e outros` : ""}`;
          return (
            <Link
              key={m.key}
              role="listitem"
              href={`/painel${filtersToQuery({ ...filters, month: isNow ? null : m.key, period: "mes" }, "mes")}`}
              className={`outlook-col ${isSel ? "selected" : ""} ${isNow ? "current" : ""}`}
              aria-label={label}
              aria-current={isSel ? "true" : undefined}
              scroll={false}
              style={{ gridColumn: i + 2 }}
            >
              <span className="outlook-tip" aria-hidden>
                <strong>
                  {longMonth(m.key)}
                  {isNow ? " · este mês" : ""}
                </strong>
                <span className="outlook-tip-total">{money(m.cents)}</span>
                {m.cents > 0 && (
                  <>
                    {other > 0 && (
                      <span>
                        <i className="sw other" /> Parcelas e outros {money(other)}
                      </span>
                    )}
                    {m.recurringCents > 0 && (
                      <span>
                        <i className="sw fixed" /> Contas fixas {money(m.recurringCents)}
                      </span>
                    )}
                  </>
                )}
              </span>
              <span className="outlook-value" aria-hidden>
                {isSel && m.cents > 0 ? compact(m.cents) : ""}
              </span>
              <span className="outlook-track" aria-hidden>
                {/* Empilhado: contas fixas embaixo, parcelas e outros em cima, com um vão entre os dois. */}
                {other > 0 && <span className="outlook-seg other" style={{ height: `${pct(other)}%` }} />}
                {m.recurringCents > 0 && <span className="outlook-seg fixed" style={{ height: `${pct(m.recurringCents)}%` }} />}
                {m.cents === 0 && <span className="outlook-seg zero" />}
              </span>
              <span className="outlook-month" aria-hidden>
                {shortMonth(m.key)}
                {m.key.endsWith("-01") || isNow ? <span className="outlook-year">{m.key.slice(2, 4)}</span> : null}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
