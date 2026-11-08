import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Inbox, Plus, Upload } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { TxRowLink } from "@/components/tx-row";
import { Avatar, CategoryIcon, Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { filtersToQuery, parseFilters, PERIODS } from "@/lib/filters";
import { getDashboard, getDebts, getLookupsFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage({ searchParams }: PageProps<"/painel">) {
  const auth = await requireAuth();
  const sp = await searchParams;
  // O painel abre no mês atual (o que importa agora); "Todo o período" continua no filtro.
  const filters = parseFilters(sp, "mes");
  const lookups = await getLookupsFor(auth);
  const [data, debts] = await Promise.all([getDashboard(auth, filters, lookups), getDebts(auth, lookups)]);
  const cur = auth.currency;

  const people = new Map(lookups.participants.map((p) => [p.id, p]));
  const cats = new Map(lookups.categories.map((c) => [c.id, c]));
  const firstName = auth.userName.split(" ")[0];
  const me = auth.participantId;
  const focus = filters.person ? people.get(filters.person) : null;

  const pendingStatus = lookups.statuses.find((s) => s.behavior === "pending" && !s.archived);
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.cents));
  // Dívidas que envolvem você primeiro.
  const debtLines = [...debts.settlements].sort((a, b) => Number(b.fromId === me || b.toId === me) - Number(a.fromId === me || a.toId === me));
  const nameOf = (id: string) => people.get(id)?.name ?? "Alguém";
  const sentence = (fromId: string, toId: string) =>
    fromId === me ? <>Você deve para <strong>{nameOf(toId)}</strong></> : toId === me ? <><strong>{nameOf(fromId)}</strong> te deve</> : <><strong>{nameOf(fromId)}</strong> deve para <strong>{nameOf(toId)}</strong></>;
  const periodLabel = PERIODS.find((p) => p.value === filters.period)?.label.toLowerCase();
  const welcome = sp.bemvindo === "1";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Olá, {firstName}</h1>
          <p className="muted">
            {focus ? `Vendo só ${focus.name}` : auth.role === "owner" ? "Resumo da família" : "Seu resumo"} · {periodLabel}
          </p>
        </div>
      </div>

      {welcome && (
        <div className="notice" style={{ marginBottom: 16 }}>
          Conta criada. Próximos passos: cadastre as pessoas em <Link href="/ajustes/pessoas" className="pos">Ajustes → Pessoas</Link>,
          depois registre um gasto ou importe um extrato. Categorias, status e projetos também são todos editáveis em Ajustes.
        </div>
      )}

      <section className="card debts" aria-labelledby="dividas" data-tour="dash-debts">
        <div className="card-head">
          <h2 id="dividas">Quem deve para quem</h2>
          <Link href="/dividas">
            Ver tudo <ArrowRight size={13} style={{ verticalAlign: -2 }} />
          </Link>
        </div>
        {debtLines.length === 0 ? (
          <p className="debts-empty">
            <CheckCircle2 size={18} strokeWidth={1.7} aria-hidden /> Ninguém deve nada a ninguém.
          </p>
        ) : (
          <div className="rows">
            {debtLines.map((d) => (
              <div key={d.fromId + d.toId} className={`row debt-row ${d.toId === me ? "in" : d.fromId === me ? "out" : ""}`}>
                <span className="debt-people" aria-hidden>
                  <Avatar name={nameOf(d.fromId)} color={people.get(d.fromId)?.color ?? "#94A3B8"} size={30} />
                  <ArrowRight size={14} strokeWidth={1.8} />
                  <Avatar name={nameOf(d.toId)} color={people.get(d.toId)?.color ?? "#94A3B8"} size={30} />
                </span>
                <p className="grow title">
                  {sentence(d.fromId, d.toId)} <span className="debt-amount"><Money cents={d.amountCents} currency={cur} /></span>
                </p>
                <Link
                  className="btn small"
                  href={`/transacoes/nova?acerto=${d.fromId}.${d.toId}.${d.amountCents}`}
                  aria-label={`Registrar pagamento de ${nameOf(d.fromId)} para ${nameOf(d.toId)}`}
                >
                  Registrar pagamento
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <div data-tour="dash-filters">
      <FilterBar
        filters={filters}
        participants={lookups.participants}
        categories={lookups.categories}
        projects={lookups.projects}
        statuses={lookups.statuses}
        cards={lookups.cards}
        defaultPeriod="mes"
      />
      </div>

      <div className="stats stats-3">
        <div className="stat">
          <p className="label">{focus ? `Parte de ${focus.name}` : "Gastos"}</p>
          <p className="value"><Money cents={data.spent} currency={cur} /></p>
          <p className="hint">em despesas</p>
        </div>
        <div className="stat">
          <p className="label">Entradas</p>
          <p className="value"><Money cents={data.income} currency={cur} /></p>
          <p className="hint">em receitas</p>
        </div>
        <Link className="stat" href={`/transacoes${filtersToQuery({ ...filters, status: pendingStatus?.id ?? null })}`}>
          <p className="label">Pendências</p>
          <p className="value"><Money cents={data.pendingTotal} currency={cur} /></p>
          <p className="hint">{data.pendingCount} {data.pendingCount === 1 ? "lançamento" : "lançamentos"}</p>
        </Link>
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
                  <TxRowLink key={t.id} tx={t} lookups={lookups} currency={cur} me={me} />
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
                        <CategoryIcon icon={cat?.icon} color={color} size={26} />
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

        </div>
      )}
    </>
  );
}
