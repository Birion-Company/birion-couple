import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui";
import { requireAuditor } from "@/lib/auth";
import { auditHousehold } from "@/lib/audit";
import { AuditContacts, AuditFeed } from "@/components/audit-lists";

export const metadata: Metadata = { title: "Família - Auditoria" };

const when = (d: Date | string) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Uma família por dentro: quem tem login, os contatos e tudo o que foi feito, em frases. */
export default async function AuditHouseholdPage({ params }: PageProps<"/auditoria/familia/[id]">) {
  const auditor = await requireAuditor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await auditHousehold(id, auditor.userId);
  if (!data) notFound();
  const { house, members, contacts, feed } = data;
  return (
    <>
      <Link href="/auditoria" className="btn small ghost" style={{ marginBottom: 12 }}>
        <ArrowLeft size={15} /> Voltar
      </Link>
      <div className="page-head">
        <div>
          <h1>{house.name}</h1>
          <p className="muted">
            Desde {when(house.createdAt)} · {members.length} com login · {contacts.length} contatos · {data.transactions} lançamentos · {data.cards} cartões
          </p>
        </div>
      </div>

      <div className="grid audit-cols">
        <section className="card section" aria-labelledby="membros">
          <div className="card-head">
            <h2 id="membros">Com login</h2>
          </div>
          <div className="rows">
            {members.map((m) => (
              <div key={m.id} className="row">
                <Avatar name={m.name} color="#1ac4db" size={32} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <p className="title">
                    {m.name} {m.username ? <span className="pos">@{m.username}</span> : null}{" "}
                    <span className="faint">· {m.role === "owner" ? "administra" : "membro"}</span>
                  </p>
                  <p className="sub">
                    {m.email} · entrou em {when(m.joinedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {contacts.length > 0 && (
            <>
              <h3 className="card-subhead">Contatos (sem login)</h3>
              <AuditContacts items={contacts.map((c) => ({ id: c.id, name: c.name, color: c.color, archived: c.archived }))} />
            </>
          )}
        </section>

        <section className="card section" aria-labelledby="historico">
          <div className="card-head">
            <h2 id="historico">O que foi feito</h2>
            <span className="faint">{feed.length} ações</span>
          </div>
          {feed.length === 0 ? <p className="faint">Nada registrado ainda.</p> : <AuditFeed householdId={id} initial={{ rows: feed.map((f) => ({ id: f.id, when: f.when, actor: f.actor, text: f.text, detail: f.detail, href: null })), next: data.feedNext }} />}
        </section>
      </div>
    </>
  );
}
