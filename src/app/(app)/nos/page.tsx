import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart, UserPlus } from "lucide-react";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { CountMoney } from "@/components/count-money";
import { GoalsEditor } from "@/components/goals-editor";
import { Avatar, CategoryIcon, Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { addMonthsKey, longMonth, todayIn } from "@/lib/cards";
import { getCoupleMonth, getLookupsFor } from "@/lib/queries";
import { formatDate } from "@/components/ui";

export const metadata: Metadata = { title: "Nós dois" };

/** O painel do casal: o mês das duas pessoas juntas, o que cada uma pagou e consumiu, e as metas que vocês dividem. */
export default async function CouplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const current = todayIn().slice(0, 7);
  const month = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : current;
  const lookups = await getLookupsFor(auth);
  const data = await getCoupleMonth(auth, month);
  const people = new Map(lookups.participants.map((p) => [p.id, p]));
  const cats = new Map(lookups.categories.map((c) => [c.id, c]));
  const me = auth.participantId ? people.get(auth.participantId) : null;
  const partner = data?.partnerId ? people.get(data.partnerId) : null;
  const cur = auth.currency;
  const monthName = longMonth(month).replace(/ de \d{4}$/, "").toLowerCase();
  const G = schema.goals;
  const goals = await getDb()
    .select()
    .from(G)
    .where(and(eq(G.shared, true), or(eq(G.userId, auth.userId), sql`${G.userId} in (select "userId" from "memberships" where "householdId" = ${auth.householdId})`)))
    .orderBy(asc(G.targetMonth), asc(G.createdAt));

  if (!data || !partner || !me) {
    return (
      <section className="couple-empty card">
        <Heart size={36} strokeWidth={1.4} />
        <h1>Nós dois</h1>
        <p className="muted">Aqui fica o mês de vocês juntos. Falta o seu par entrar.</p>
        <Link className="btn primary" href="/ajustes">
          <UserPlus size={16} /> Convidar parceiro(a)
        </Link>
      </section>
    );
  }
  const mine = data.per[data.me];
  const theirs = data.per[data.partnerId!];
  const maxPaid = Math.max(1, mine.paid, theirs.paid);
  // O acerto é só o que um pagou e coube ao outro: pagar por um terceiro não entra.
  const meNet = data.net;
  const partnerName = partner.name.split(" ")[0];
  const prev = addMonthsKey(month, -1);
  const next = addMonthsKey(month, 1);

  return (
    <div className="couple-page">
      <section className="couple-hero">
        <div className="couple-hero-faces rise" style={{ "--i": 0 } as React.CSSProperties}>
          <Avatar name={me.name} color={me.color} size={64} src={me.avatarUrl} />
          <Heart size={30} strokeWidth={0} fill="currentColor" className="couple-heart big" aria-hidden />
          <Avatar name={partner.name} color={partner.color} size={64} src={partner.avatarUrl} />
        </div>
        <h1 className="hero-title rise" style={{ "--i": 1 } as React.CSSProperties}>{auth.householdName}</h1>
        <nav className="couple-month rise" style={{ "--i": 2 } as React.CSSProperties} aria-label="Mês">
          <Link href={`/nos?mes=${prev}`} aria-label="Mês anterior" className="icon-btn">
            <ChevronLeft size={18} />
          </Link>
          <strong>{longMonth(month)}</strong>
          <Link href={`/nos?mes=${next}`} aria-label="Próximo mês" className="icon-btn">
            <ChevronRight size={18} />
          </Link>
        </nav>
      </section>

      <section className="couple-stats">
        <div className="st-cell rise" style={{ "--i": 3 } as React.CSSProperties}>
          <span className="st-label">Gastamos juntos em {monthName}</span>
          <strong className="st-value neg"><CountMoney cents={data.together} currency={cur} /></strong>
          <span className="faint">{data.sharedCount} {data.sharedCount === 1 ? "gasto" : "gastos"} dos dois</span>
        </div>
        <div className="st-cell rise" style={{ "--i": 4 } as React.CSSProperties}>
          <span className="st-label">Sua parte</span>
          <strong className="st-value"><CountMoney cents={mine.consumed} currency={cur} /></strong>
          <span className="faint">{partnerName}: <Money cents={theirs.consumed} currency={cur} /></span>
        </div>
        <div className="st-cell st-final rise" style={{ "--i": 5 } as React.CSSProperties}>
          <span className="st-label">Acerto do mês</span>
          <strong className={`st-value ${meNet < 0 ? "neg" : meNet > 0 ? "pos" : ""}`}>
            <CountMoney cents={Math.abs(meNet)} currency={cur} />
          </strong>
          <span className="faint">{meNet === 0 ? "tudo certo entre nós" : meNet > 0 ? `${partnerName} te deve` : `você deve a ${partnerName}`}</span>
        </div>
      </section>

      <div className="couple-grid">
        <section className="card" aria-labelledby="quem-pagou">
          <div className="card-head">
            <h2 id="quem-pagou">Quem pagou e quem consumiu</h2>
          </div>
          {[
            { p: me, v: mine, you: true },
            { p: partner, v: theirs, you: false },
          ].map(({ p, v, you }) => (
            <div key={p.id} className="couple-person-row">
              <div className="couple-person-head">
                <Avatar name={p.name} color={p.color} size={32} src={p.avatarUrl} />
                <strong>{you ? "Você" : p.name}</strong>
              </div>
              <div className="couple-bars">
                <div>
                  <span className="faint">pagou</span>
                  <div className="bar"><span style={{ width: `${(v.paid / maxPaid) * 100}%`, background: p.color }} /></div>
                  <Money cents={v.paid} currency={cur} />
                </div>
                <div>
                  <span className="faint">consumiu</span>
                  <div className="bar"><span style={{ width: `${(v.consumed / maxPaid) * 100}%`, background: p.color, opacity: 0.55 }} /></div>
                  <Money cents={v.consumed} currency={cur} />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="card static-layout" aria-labelledby="cat-nos">
          <div className="card-head">
            <h2 id="cat-nos">Onde mais gastamos</h2>
          </div>
          {data.byCategory.length === 0 ? (
            <div className="empty">Nenhum gasto em {monthName}.</div>
          ) : (
            <div className="rows">
              {data.byCategory.map((c) => {
                const cat = cats.get(c.id);
                return (
                  <div key={c.id} className="row" style={{ display: "block" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <CategoryIcon icon={cat?.icon} color={cat?.color ?? "#CBD5E1"} size={26} />
                      <span className="grow title">{cat?.name ?? "Sem categoria"}</span>
                      <Money cents={c.cents} currency={cur} />
                    </div>
                    <div className="bar"><span style={{ width: `${(c.cents / Math.max(1, data.byCategory[0].cents)) * 100}%`, background: cat?.color ?? "#CBD5E1" }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="juntos">
          <div className="card-head">
            <h2 id="juntos">Últimos gastos juntos</h2>
            <Link href="/transacoes" className="faint">ver todos</Link>
          </div>
          {data.recentShared.length === 0 ? (
            <div className="empty">Ainda não dividiram nenhum gasto neste mês.</div>
          ) : (
            <div className="rows">
              {data.recentShared.map((r) => (
                <Link key={r.id} href={`/transacoes/${r.id}`} className="row">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <p className="title">{r.description}</p>
                    <p className="sub">{formatDate(r.date)} · pago por {r.payerId === auth.participantId ? "você" : people.get(r.payerId ?? "")?.name ?? "alguém"}</p>
                  </div>
                  <Money cents={r.amountCents} currency={cur} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <h2 className="couple-goals-title">Metas do casal</h2>
      <GoalsEditor
        compact
        shared
        currency={cur}
        nowMonth={current}
        goals={goals.map((g) => ({ id: g.id, name: g.name, targetCents: g.targetCents, savedCents: g.savedCents, targetMonth: g.targetMonth }))}
      />
    </div>
  );
}
