import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AddToProject, DeleteProject, RemoveFromProject } from "@/components/projects";
import { Money, formatDate } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { getLookups, getProjectCandidates, getProjectTransactions } from "@/lib/queries";

export const metadata: Metadata = { title: "Projeto" };

/** Um projeto: o total, os lançamentos dele e o botão para colocar mais. */
export default async function ProjectPage({ params }: PageProps<"/projetos/[id]">) {
  const auth = await requireAuth();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [lookups, rows, candidates] = await Promise.all([getLookups(auth.householdId), getProjectTransactions(auth, id), getProjectCandidates(auth)]);
  const project = lookups.projects.find((p) => p.id === id);
  if (!project) notFound();
  const cat = (cid: string | null) => (cid ? lookups.categories.find((c) => c.id === cid)?.name ?? "—" : "Sem categoria");
  const me = auth.participantId;
  const expenses = rows.filter((r) => r.kind === "expense");
  const total = expenses.reduce((a, r) => a + r.amountCents, 0);
  const mine = expenses.reduce((a, r) => a + (r.splits.find((s) => s.participantId === me)?.amountCents ?? 0), 0);
  const series = (r: { seriesIndex: number | null; seriesTotal: number | null; seriesKind: string | null }) =>
    r.seriesKind === "installment" ? `${r.seriesIndex}/${r.seriesTotal}` : r.seriesKind === "monthly" ? "todo mês" : "";
  return (
    <>
      <Link href="/projetos" className="btn small ghost" style={{ marginBottom: 12 }}>
        <ArrowLeft size={15} /> Projetos
      </Link>
      <div className="page-head">
        <div>
          <h1>
            <span className="project-swatch big" style={{ background: project.color }} aria-hidden /> {project.name}
          </h1>
          <p className="muted">
            {rows.length} {rows.length === 1 ? "lançamento" : "lançamentos"} · total <Money cents={total} currency={auth.currency} /> · sua parte{" "}
            <Money cents={mine} currency={auth.currency} />
          </p>
        </div>
        <AddToProject
          projectId={project.id}
          name={project.name}
          currency={auth.currency}
          candidates={candidates.map((c) => ({ id: c.id, date: c.date, description: c.description, amountCents: c.amountCents, category: cat(c.categoryId), series: c.seriesTotal ? `${c.seriesIndex}/${c.seriesTotal}` : "" }))}
        />
      </div>
      <section className="card section">
        {rows.length === 0 ? (
          <p className="faint">Nada aqui ainda. Toque em “Colocar lançamentos” e marque os que são deste projeto — ou escolha o projeto ao lançar.</p>
        ) : (
          <div className="rows">
            {rows.map((r) => (
              <div key={r.id} className="row">
                <Link href={`/transacoes/${r.id}`} className="grow" style={{ minWidth: 0 }}>
                  <span className="title">
                    {r.description}
                    {series(r) && <span className="tx-series">{series(r)}</span>}
                  </span>
                  <span className="sub" style={{ display: "block" }}>
                    {formatDate(r.date, { day: "2-digit", month: "short", year: "numeric" })} · {cat(r.categoryId)}
                  </span>
                </Link>
                <Money cents={r.amountCents} currency={auth.currency} />
                <RemoveFromProject txId={r.id} />
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="actions" style={{ justifyContent: "flex-end" }}>
        <DeleteProject id={project.id} name={project.name} />
      </div>
    </>
  );
}
