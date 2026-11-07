import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Inbox, Plus, Upload } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { TxRowLink } from "@/components/tx-row";
import { Avatar, Dot, Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { filtersToQuery, parseFilters, PERIODS } from "@/lib/filters";
import { getDashboard, getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage({ searchParams }: PageProps<"/painel">) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const lookups = await getLookups(auth.householdId);
  const data = await getDashboard(auth.householdId, filters, lookups);
  const cur = auth.currency;

  const people = new Map(lookups.participants.map((p) => [p.id, p]));
  const cats = new Map(lookups.categories.map((c) => [c.id, c]));
  const firstName = auth.userName.split(" ")[0];
  const me = auth.participantId;
  const myBalance = me ? data.balances.get(me) ?? 0 : null;
  const focus = filters.person ? people.get(filters.person) : null;

  const pendingStatus = lookups.statuses.find((s) => s.behavior === "pending" && !s.archived);
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.cents));
  const balanceList = lookups.participants
    .filter((p) => !p.archived || (data.balances.get(p.id) ?? 0) !== 0)
    .map((p) => ({ p, v: data.balances.get(p.id) ?? 0 }))
    .sort((a, b) => b.v - a.v);
  const periodLabel = PERIODS.find((p) => p.value === filters.period)?.label.toLowerCase();
  const welcome = sp.bemvindo === "1";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Olá, {firstName}</h1>
          <p className="muted">
            {focus ? `Vendo só ${focus.name}` : "Resumo da família"} · {periodLabel}
          </p>
        </div>
      </div>

      {welcome && (
        <div className="notice" style={{ marginBottom: 16 }}>
          Conta criada. Próximos passos: cadastre as pessoas em <Link href="/ajustes/pessoas" className="pos">Ajustes → Pessoas</Link>,
          depois registre um gasto ou importe um extrato. Categorias, status e projetos também são todos editáveis em Ajustes.
        </div>
      )}

      <FilterBar
        filters={filters}
        participants={lookups.participants}
        categories={lookups.categories}
        projects={lookups.projects}
        statuses={lookups.statuses}
      />

      <div className="stats">
        <div className="stat">
          <p className="label">{focus ? `Parte de ${focus.name}` : "Gastos"}</p>
          <p className="value"><Money cents={data.spent} currency={cur} /></p>
          <p className="hint">em despesas</p>
        </div>
        <Link className="stat" href={`/transacoes${filtersToQuery({ ...filters, status: pendingStatus?.id ?? null })}`}>
          <p className="label">Pendências</p>
          <p className="value"><Money cents={data.pendingTotal} currency={cur} /></p>
          <p className="hint">{data.pendingCount} {data.pendingCount === 1 ? "lançamento" : "lançamentos"}</p>
        </Link>
        {focus ? (
          <div className="stat">
            <p className="label">Saldo de {focus.name}</p>
            <p className="value"><Money cents={data.balances.get(focus.id) ?? 0} currency={cur} signed /></p>
            <p className="hint">{(data.balances.get(focus.id) ?? 0) >= 0 ? "a receber" : "a pagar"}</p>
          </div>
        ) : myBalance !== null ? (
          <div className="stat">
            <p className="label">Seu saldo</p>
            <p className="value"><Money cents={myBalance} currency={cur} signed /></p>
            <p className="hint">{myBalance > 0 ? "você tem a receber" : myBalance < 0 ? "você deve" : "tudo em dia"}</p>
          </div>
        ) : (
          <div className="stat">
            <p className="label">Entradas</p>
            <p className="value"><Money cents={data.income} currency={cur} /></p>
            <p className="hint">em receitas</p>
          </div>
        )}
        <div className="stat">
          <p className="label">Lançamentos</p>
          <p className="value num">{data.count}</p>
          <p className="hint">no filtro atual</p>
        </div>
      </div>

      {data.count === 0 ? (
        <div className="card section">
          <div className="empty">
            <Inbox size={36} strokeWidth={1.2} />
            <p>Nenhum lançamento por aqui ainda.</p>
            <div className="actions" style={{ justifyContent: "center", marginTop: 14 }}>
              <Link className="btn primary" href="/transacoes/nova"><Plus size={16} /> Novo lançamento</Link>
              <Link className="btn" href="/importar"><Upload size={16} strokeWidth={1.6} /> Importar extrato</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-2 section">
          <section className="card" aria-labelledby="saldos">
            <div className="card-head">
              <h2 id="saldos">Quem deve e quem recebe</h2>
            </div>
            <div className="rows">
              {balanceList.map(({ p, v }) => (
                <Link key={p.id} href={`/painel${filtersToQuery({ ...filters, person: p.id })}`} className="row balance-row">
                  <Avatar name={p.name} color={p.color} />
                  <div className="grow">
                    <p className="title">{p.name}{p.id === me ? " (você)" : ""}</p>
                    <p className={`sub balance-tag ${v > 0 ? "pos" : v < 0 ? "neg" : ""}`}>
                      {v > 0 ? "tem a receber" : v < 0 ? "deve" : "em dia"}
                    </p>
                  </div>
                  <span className="amount"><Money cents={v} currency={cur} signed /></span>
                </Link>
              ))}
            </div>
            {data.settlements.length > 0 && (
              <div className="sheet">
                <p className="label-text" style={{ marginBottom: 6 }}>Como acertar</p>
                <div className="rows">
                  {data.settlements.map((s) => (
                    <div key={s.fromId + s.toId} className="row" style={{ minHeight: 44 }}>
                      <div className="grow">
                        <p className="title" style={{ fontSize: "0.9rem" }}>
                          {people.get(s.fromId)?.name} paga <Money cents={s.amountCents} currency={cur} /> para {people.get(s.toId)?.name}
                        </p>
                      </div>
                      <Link
                        className="btn small"
                        href={`/transacoes/nova?acerto=${s.fromId}.${s.toId}.${s.amountCents}`}
                        aria-label={`Registrar acerto de ${people.get(s.fromId)?.name} para ${people.get(s.toId)?.name}`}
                      >
                        Registrar
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.settlements.length === 0 && (
              <p className="faint" style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <CheckCircle2 size={15} strokeWidth={1.6} /> Ninguém deve nada no filtro atual.
              </p>
            )}
          </section>

          <section className="card" aria-labelledby="pend">
            <div className="card-head">
              <h2 id="pend">Pendências</h2>
              {data.pendingCount > 0 && (
                <Link href={`/transacoes${filtersToQuery({ ...filters, status: pendingStatus?.id ?? null })}`}>
                  Ver todas <ArrowRight size={13} style={{ verticalAlign: -2 }} />
                </Link>
              )}
            </div>
            {data.pending.length === 0 ? (
              <div className="empty">
                <Clock3 size={30} strokeWidth={1.2} />
                Nada pendente.
              </div>
            ) : (
              <div className="rows">
                {data.pending.map((t) => (
                  <TxRowLink key={t.id} tx={t} lookups={lookups} currency={cur} />
                ))}
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="cats">
            <div className="card-head">
              <h2 id="cats">Gastos por categoria</h2>
            </div>
            {data.byCategory.length === 0 ? (
              <div className="empty">Sem despesas no filtro atual.</div>
            ) : (
              <div className="rows">
                {data.byCategory.slice(0, 8).map((c) => {
                  const cat = cats.get(c.id);
                  const color = cat?.color ?? "#CBD5E1";
                  return (
                    <Link key={c.id} href={`/transacoes${filtersToQuery({ ...filters, category: c.id })}`} className="row" style={{ display: "block" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <Dot color={color} />
                        <span className="grow title">{cat?.name ?? "Sem categoria"}</span>
                        <span className="amount"><Money cents={c.cents} currency={cur} /></span>
                        <span className="faint num" style={{ width: 40, textAlign: "right" }}>
                          {Math.round((c.cents / Math.max(1, data.spent)) * 100)}%
                        </span>
                      </div>
                      <div className="bar"><span style={{ width: `${(c.cents / maxCat) * 100}%`, background: color }} /></div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="recent">
            <div className="card-head">
              <h2 id="recent">Últimos lançamentos</h2>
              <Link href={`/transacoes${filtersToQuery(filters)}`}>
                Ver todos <ArrowRight size={13} style={{ verticalAlign: -2 }} />
              </Link>
            </div>
            <div className="rows">
              {data.recent.map((t) => (
                <TxRowLink key={t.id} tx={t} lookups={lookups} currency={cur} />
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
