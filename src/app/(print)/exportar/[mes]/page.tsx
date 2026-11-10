import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print-toolbar";
import { getAuth, requireAuth } from "@/lib/auth";
import { getLookupsFor } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { getMonthReport, reportFileName, type MonthReport } from "@/lib/report";
import { longMonth } from "@/lib/cards";

/** O "Salvar como PDF" usa o título da página como nome do arquivo. */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ mes: string }>;
  searchParams: Promise<{ pessoa?: string }>;
}): Promise<Metadata> {
  const { mes } = await params;
  const { pessoa } = await searchParams;
  const ok = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  // Extrato de outra pessoa: o nome dela vai no nome do arquivo.
  const auth = pessoa ? await getAuth() : null;
  const who =
    auth && pessoa
      ? (await getLookupsFor(auth)).participants.find(
          (p) => p.id === pessoa && p.id !== auth.participantId,
        )?.name
      : null;
  return {
    title: {
      absolute: ok
        ? reportFileName(`Extrato de ${longMonth(mes).toLowerCase()}`, who)
        : "Birion - Relatório",
    },
  };
}

/** Foto da pessoa (ou as iniciais na cor dela, se não tiver foto). */
function Face({
  who,
  size = 40,
}: {
  who: { name: string; color: string; photo: string | null };
  size?: number;
}) {
  const initials = who.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join("");
  return who.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="rep-face"
      src={`data:image/jpeg;base64,${who.photo}`}
      alt=""
      width={size}
      height={size}
    />
  ) : (
    <span
      className="rep-face"
      style={{
        width: size,
        height: size,
        background: who.color,
        fontSize: size * 0.4,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
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
  searchParams: Promise<{ imprimir?: string; pessoa?: string }>;
}) {
  const auth = await requireAuth();
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const sp = await searchParams;
  const r = await getMonthReport(auth, mes, sp.pessoa ?? null);
  const m = (c: number) => formatMoney(c, r.currency);
  /** Com sinal: + entrada / te devem, − saída / você deve. */
  const sm = (c: number) =>
    (c > 0 ? "+" : c < 0 ? "−" : "") + formatMoney(Math.abs(c), r.currency);
  const d = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return (
    <div className="rep">
      <PrintToolbar auto={sp.imprimir === "1"} />
      <article className="rep-page">
        <header className="rep-head">
          <div>
            <p className="rep-brand">BIRION FINANCE</p>
            <h1>{r.title.replace(/^./, (c) => c.toUpperCase())}</h1>
            {/* De quem é o extrato (foto e nome) e, se for de outra pessoa, quem mandou. */}
            <div className="rep-people">
              <span className="rep-who">
                <Face who={r.subject ?? r.owner} />
                <span>
                  <strong>{(r.subject ?? r.owner).name}</strong>
                  <em>{r.subject ? "extrato desta pessoa" : r.family}</em>
                </span>
              </span>
              {r.subject && (
                <span className="rep-who">
                  <Face who={r.owner} size={30} />
                  <span>
                    <strong>{r.owner.name}</strong>
                    <em>quem enviou</em>
                  </span>
                </span>
              )}
            </div>
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

        <section className="rep-cards" style={{ gridTemplateColumns: `repeat(${r.cards.length}, 1fr)` }}>
          {r.cards.map((c) => (
            <div key={c.label} className="rep-card">
              <span>{c.label}</span>
              <strong
                className={
                  c.signed
                    ? c.cents > 0
                      ? "pos"
                      : c.cents < 0
                        ? "neg"
                        : ""
                    : ""
                }
              >
                {c.signed ? sm(c.cents) : m(c.cents)}
              </strong>
              {c.note && <em>{c.note}</em>}
            </div>
          ))}
        </section>

        <div className={r.subject ? "rep-one" : "rep-two"}>
          {!r.subject && (
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
          )}
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
                          <strong>{x.label}</strong>
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
          <h2>Gastos por categoria{r.subject ? ` de ${r.subject.name}` : ""}</h2>
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
            shareLabel={r.shareLabel}
            title="Recorrentes (todo mês)"
            list={r.recurring}
            totalLabel="Saldo das recorrentes (entradas − saídas)"
            m={m}
            d={d}
          />
        )}
        <TxTable
          shareLabel={r.shareLabel}
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
  shareLabel,
  title,
  list,
  totalLabel,
  m,
  d,
}: {
  shareLabel: string;
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
            <th className="n">{shareLabel}</th>
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
