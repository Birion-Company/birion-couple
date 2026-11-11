import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Users, Home, ReceiptText, Activity, UserPlus } from "lucide-react";
import { formatDate } from "@/components/ui";
import { requireAuditor } from "@/lib/auth";
import { auditHouseholds, auditOverview, auditUsers } from "@/lib/audit";

export const metadata: Metadata = { title: "Auditoria" };

const when = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "nunca");

/** Visão geral da auditoria: números do site, quem se cadastrou e as famílias. */
export default async function AuditPage() {
  await requireAuditor();
  const [o, users, houses] = await Promise.all([auditOverview(), auditUsers(), auditHouseholds()]);
  const stat = (icon: React.ReactNode, label: string, value: number, hint: string) => (
    <div className="stat">
      <p className="label audit-stat-label">
        {icon} {label}
      </p>
      <p className="value num">{value.toLocaleString("pt-BR")}</p>
      <p className="hint">{hint}</p>
    </div>
  );
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Auditoria</h1>
          <p className="muted">Quem usa o Birion e o que cada pessoa fez. Nada aqui pode ser alterado.</p>
        </div>
      </div>

      <div className="stats audit-stats">
        {stat(<Users size={15} aria-hidden />, "Pessoas cadastradas", o.users, `${o.newUsersMonth} nos últimos 30 dias`)}
        {stat(<Home size={15} aria-hidden />, "Famílias", o.households, "cada uma com seus dados")}
        {stat(<ReceiptText size={15} aria-hidden />, "Lançamentos", o.transactions, "somando todas as famílias")}
        {stat(<Activity size={15} aria-hidden />, "Ações na semana", o.activityWeek, "criar, alterar, excluir, pagar…")}
      </div>

      <section className="card section" aria-labelledby="familias">
        <div className="card-head">
          <h2 id="familias">Famílias</h2>
          <span className="faint">toque para ver o histórico</span>
        </div>
        <div className="rows">
          {houses.map((f) => (
            <Link key={f.id} href={`/auditoria/familia/${f.id}`} className="row audit-row">
              <span className="audit-icon" aria-hidden>
                <Home size={16} />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <p className="title">{f.name}</p>
                <p className="sub">
                  Desde {formatDate(f.createdAt.toISOString().slice(0, 10), { day: "2-digit", month: "short", year: "numeric" })} · {f.members} com login · {f.contacts} contatos · {f.transactions} lançamentos
                </p>
              </div>
              <span className="faint audit-when">Última ação: {when(f.lastActivity)}</span>
              <ChevronRight size={16} className="faint" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <section className="card section" aria-labelledby="pessoas">
        <div className="card-head">
          <h2 id="pessoas">Pessoas cadastradas</h2>
          <span className="faint">{users.length}</span>
        </div>
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Família</th>
                <th>Perfil</th>
                <th>Cadastro</th>
                <th>Última ação</th>
                <th className="num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((x) => (
                <tr key={x.id + (x.householdId ?? "")}>
                  <td>
                    <strong>{x.name}</strong>
                    <span className="faint audit-email">{x.email}</span>
                  </td>
                  <td>{x.householdId ? <Link href={`/auditoria/familia/${x.householdId}`} className="pos">{x.household}</Link> : <span className="faint">sem família</span>}</td>
                  <td>{x.role === "owner" ? "Administra" : x.role ? "Membro" : "—"}</td>
                  <td>
                    <UserPlus size={13} className="faint" aria-hidden /> {when(x.createdAt)}
                  </td>
                  <td>{when(x.lastActivity)}</td>
                  <td className="num">{x.actions ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
