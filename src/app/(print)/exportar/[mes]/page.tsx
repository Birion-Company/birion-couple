import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print-toolbar";
import { requireAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getMonthReport, reportFileName, type MonthReport } from "@/lib/report";
import { longMonth } from "@/lib/cards";

/** O "Salvar como PDF" usa o título da página como nome do arquivo. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ mes: string }>;
}): Promise<Metadata> {
  const { mes } = await params;
  const ok = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  return {
    title: {
      absolute: ok
        ? reportFileName(`Extrato de ${longMonth(mes).toLowerCase()}`)
        : "Birion - Relatório",
    },
  };
}

/**
 * Extrato do mês para imprimir ou salvar em PDF (Ajustes → Exportação): folha A4 branca, com resumo,
 * faturas, gastos por categoria, dívidas e todos os lançamentos — no estilo de extrato de banco.
 */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ mes: string }>;
  searchParams: Promise<{ imprimir?: string }>;
}) {
  const auth = await requireAuth();
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const r = await getMonthReport(auth, mes);
  const sp = await searchParams;
  const m = (c: number) => formatMoney(c, r.currency);
  /** Com sinal: + entrada / te devem, − saída / você deve. */
  const sm = (c: number) =>
    (c > 0 ? "+" : c < 0 ? "−" : "") + formatMoney(Math.abs(c), r.currency);
  const d = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const s = r.summary;
  return (
    <div className="rep">
      <PrintToolbar auto={sp.imprimir === "1"} />
      <article className="rep-page">
        <header className="rep-head">
          <div>
            <p className="rep-brand">BIRION FINANCE</p>
            <h1>{r.title.replace(/^./, (c) => c.toUpperCase())}</h1>
            <p className="rep-sub">
              {r.family} · {r.person}
            </p>
          </div>
          <p className="rep-gen">
            Gerado em
            <br />
            {r.generatedAt.toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Sao_Paulo",
            })}
          </p>
        </header>
        {r.estimate && (
          <p className="rep-note">
            Mês à frente: os valores são uma previsão com o que já está lançado
            (parcelas e contas fixas).
          </p>
        )}

        <section className="rep-cards">
          <div className="rep-card">
            <span>Seus gastos</span>
            <strong className="neg">{sm(-s.spentCents)}</strong>
          </div>
          <div className="rep-card">
            <span>Entradas</span>
            <strong className="pos">{sm(s.incomeCents)}</strong>
            {s.toReceiveCents > 0 && <em>+ {m(s.toReceiveCents)} a receber</em>}
          </div>
          <div className="rep-card">
            <span>Faturas a pagar</span>
            <strong>{m(s.invoicesCents)}</strong>
            {s.invoicesMineCents !== s.invoicesCents && (
              <em>sua parte {m(s.invoicesMineCents)}</em>
            )}
          </div>
          <div className="rep-card">
            <span>Te devem</span>
            <strong className="pos">{sm(s.owedToMeCents)}</strong>
          </div>
          <div className="rep-card">
            <span>Você deve</span>
            <strong className="neg">{sm(-s.iOweCents)}</strong>
          </div>
        </section>

        <div className="rep-two">
          <section>
            <h2>Faturas do cartão</h2>
            {r.invoices.length === 0 ? (
              <p className="rep-empty">Nenhuma fatura vence neste mês.</p>
            ) : (
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>Cartão</th>
                    <th>Vence</th>
                    <th className="n">Total</th>
                    <th className="n">Sua parte</th>
                  </tr>
                </thead>
                <tbody>
                  {r.invoices.map((v) => (
                    <tr key={v.card + v.due}>
                      <td>
                        {v.card}{" "}
                        {v.paid && <span className="rep-tag">paga</span>}
                      </td>
                      <td>{d(v.due)}</td>
                      <td className="n">{m(v.totalCents)}</td>
                      <td className="n">{m(v.mineCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section>
            <h2>Dívidas{r.estimate ? " do mês" : " em aberto"}</h2>
            {r.debts.length === 0 ? (
              <p className="rep-empty">Ninguém deve nada.</p>
            ) : (
              <table className="rep-table">
                <tbody>
                  {r.debts.map((x) => (
                    <Fragment key={x.name + x.direction}>
                      <tr>
                        <td>
                          <strong>
                            {x.direction === "te deve"
                              ? `${x.name} te deve`
                              : `Você deve a ${x.name}`}
                          </strong>
                        </td>
                        <td
                          className={`n ${x.direction === "te deve" ? "pos" : "neg"}`}
                        >
                          {sm(x.direction === "te deve" ? x.cents : -x.cents)}
                        </td>
                      </tr>
                      {/* De quê: cada lançamento que forma a dívida. */}
                      {x.items.map((it, k) => (
                        <tr key={k} className="rep-sub">
                          <td>
                            {it.description} · {it.date.slice(8, 10)}/
                            {it.date.slice(5, 7)}
                            {it.projected ? " · todo mês (previsto)" : ""}
                          </td>
                          <td className={`n ${it.cents > 0 ? "pos" : "neg"}`}>
                            {sm(it.cents)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <section>
          <h2>Gastos por categoria</h2>
          {r.byCategory.length === 0 ? (
            <p className="rep-empty">Sem gastos neste mês.</p>
          ) : (
            <div className="rep-bars">
              {r.byCategory.map((c) => (
                <div key={c.name} className="rep-bar">
                  <span className="rep-bar-name">{c.name}</span>
                  <span className="rep-bar-track">
                    <span style={{ width: `${Math.max(2, c.pct * 100)}%` }} />
                  </span>
                  <span className="n">{m(c.cents)}</span>
                  <span className="rep-pct">{Math.round(c.pct * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Contas "todo mês" numa lista própria, acima dos lançamentos, para identificar fácil. */}
        {r.recurring.length > 0 && (
          <TxTable
            title="Recorrentes (todo mês)"
            list={r.recurring}
            totalLabel="Saldo das recorrentes (entradas − saídas)"
            m={m}
            d={d}
          />
        )}
        <TxTable
          title="Lançamentos"
          list={r.rows}
          totalLabel="Saldo dos lançamentos (entradas − saídas)"
          m={m}
          d={d}
        />
        <footer className="rep-foot">
          BIRION FINANCE · {r.family} · {r.title}
        </footer>
      </article>
    </div>
  );
}

function TxTable({
  title,
  list,
  totalLabel,
  m,
  d,
}: {
  title: string;
  list: MonthReport["rows"];
  totalLabel: string;
  m: (c: number) => string;
  d: (iso: string) => string;
}) {
  const sm = (c: number) => (c > 0 ? "+" : c < 0 ? "−" : "") + m(Math.abs(c));
  const tone = (sign: number) => (sign > 0 ? "pos" : sign < 0 ? "neg" : "");
  // Saldo: entradas (+) menos saídas (−); dívida e acerto não entram.
  const totAll = list.reduce((a, x) => a + x.sign * x.totalCents, 0);
  const totMine = list.reduce((a, x) => a + x.sign * x.myShareCents, 0);
  return (
    <section>
      <h2>
        {title} ({list.length})
      </h2>
      <table className="rep-table rep-tx">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Quem pagou</th>
            <th className="n">Valor</th>
            <th className="n">Sua parte</th>
          </tr>
        </thead>
        <tbody>
          {list.map((x, i) => (
            <tr key={i}>
              <td>{d(x.date)}</td>
              <td>
                <span className={tone(x.sign)}>{x.description}</span>
                {x.series && <span className="rep-tag">{x.series}</span>}
                <span className="rep-meta">
                  {[
                    x.kind !== "Despesa" ? x.kind : "",
                    x.card ? `cartão ${x.card}` : "",
                    x.owing ? `deve: ${x.owing}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </td>
              <td>{x.category}</td>
              <td>{x.payer}</td>
              {/* Despesa em vermelho com −, receita em verde com +; dívida e acerto sem sinal. */}
              <td className={`n ${tone(x.sign)}`}>
                {x.sign ? sm(x.sign * x.totalCents) : m(x.totalCents)}
              </td>
              <td className={`n ${tone(x.sign)}`}>
                {x.sign ? sm(x.sign * x.myShareCents) : m(x.myShareCents)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>{totalLabel}</td>
            <td className={`n ${tone(Math.sign(totAll))}`}>{sm(totAll)}</td>
            <td className={`n ${tone(Math.sign(totMine))}`}>{sm(totMine)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
