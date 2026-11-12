import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FolderKanban } from "lucide-react";
import { NewProject } from "@/components/projects";
import { Money } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { getLookups, getProjectStats } from "@/lib/queries";

export const metadata: Metadata = { title: "Projetos" };

/** Projetos: crie um (ex.: "Viagem") e coloque nele os lançamentos daquele assunto. */
export default async function ProjectsPage() {
  const auth = await requireAuth();
  const [{ projects }, stats] = await Promise.all([getLookups(auth.householdId, auth.userId), getProjectStats(auth)]);
  const active = projects.filter((p) => !p.archived);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projetos</h1>
          <p className="muted">Junte num lugar só o que foi gasto num assunto: uma viagem, uma reforma, uma festa.</p>
        </div>
      </div>
      <section className="card section" data-tour="projects-new">
        <NewProject count={projects.length} />
      </section>
      {active.length === 0 ? (
        <div className="card section empty">
          <FolderKanban size={22} aria-hidden />
          Nenhum projeto ainda. Crie um acima e depois coloque os lançamentos nele.
        </div>
      ) : (
        <section className="card section">
          <div className="rows">
            {active.map((p) => {
              const s = stats.get(p.id);
              return (
                <Link key={p.id} href={`/projetos/${p.id}`} className="row project-row">
                  <span className="project-swatch" style={{ background: p.color }} aria-hidden />
                  <span className="grow">
                    <span className="title">{p.name}</span>
                    <span className="sub" style={{ display: "block" }}>
                      {s ? `${s.count} ${s.count === 1 ? "lançamento" : "lançamentos"}` : "Vazio · toque para colocar lançamentos"}
                    </span>
                  </span>
                  {s && <Money cents={s.totalCents} currency={auth.currency} />}
                  <ChevronRight size={16} className="faint" aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
