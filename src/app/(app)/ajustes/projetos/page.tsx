import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { ListEditor } from "@/components/list-editor";
import { Money, formatDate } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { getLookups, getProjectStats } from "@/lib/queries";

export const metadata: Metadata = { title: "Projetos" };

/**
 * Projetos: juntam gastos de um assunto (viagem, obra, festa, servidor) mesmo em categorias diferentes.
 * Em cima, o resumo de cada projeto; embaixo, criar, renomear e arquivar.
 */
export default async function ProjectsPage() {
  const auth = await requireAuth();
  const [{ projects, categories }, stats] = await Promise.all([getLookups(auth.householdId), getProjectStats(auth)]);
  const cur = auth.currency;
  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? "—" : "Sem categoria");
  const day = (iso: string) => formatDate(iso, { day: "2-digit", month: "short", year: "numeric" });
  const active = projects.filter((p) => !p.archived);
  return (
    <>
      <section className="card section project-intro">
        <span className="project-intro-icon" aria-hidden>
          <FolderKanban size={22} strokeWidth={1.7} />
        </span>
        <div>
          <p>
            <strong>Para que serve:</strong> juntar o que foi gasto num mesmo assunto, mesmo em categorias diferentes. Ex.: “Viagem para a praia” tem
            combustível (Transporte), hotel (Moradia) e restaurantes (Lazer).
          </p>
          <p className="faint">Como usar: crie o projeto aqui e escolha-o no campo “Projeto” ao lançar. Aqui você vê quanto ele já custou.</p>
        </div>
      </section>

      {active.length > 0 && (
        <div className="project-cards">
          {active.map((p) => {
            const s = stats.get(p.id);
            return (
              <section key={p.id} className="card project-card" style={{ "--pc": p.color } as React.CSSProperties}>
                <div className="project-head">
                  <span className="project-dot" aria-hidden />
                  <h2>{p.name}</h2>
                  {s && <span className="faint">{s.count} {s.count === 1 ? "lançamento" : "lançamentos"}</span>}
                </div>
                {p.description && <p className="faint project-desc">{p.description}</p>}
                {!s ? (
                  <p className="faint">Nada lançado ainda. Escolha “{p.name}” no campo Projeto ao lançar.</p>
                ) : (
                  <>
                    <div className="project-nums">
                      <div>
                        <span>Total</span>
                        <strong>
                          <Money cents={s.totalCents} currency={cur} />
                        </strong>
                      </div>
                      <div>
                        <span>Sua parte</span>
                        <strong>
                          <Money cents={s.mineCents} currency={cur} />
                        </strong>
                      </div>
                      <div>
                        <span>Período</span>
                        <strong className="project-period">{s.first === s.last ? day(s.first) : `${day(s.first)} → ${day(s.last)}`}</strong>
                      </div>
                    </div>
                    <div className="project-cats">
                      {s.byCategory.slice(0, 4).map((c) => (
                        <span key={c.categoryId ?? "sem"} className="chip">
                          {catName(c.categoryId)} · <Money cents={c.cents} currency={cur} />
                        </span>
                      ))}
                    </div>
                    <details className="project-more">
                      <summary>Ver lançamentos</summary>
                      <div className="rows">
                        {s.recent.map((r) => (
                          <Link key={r.id} href={`/transacoes/${r.id}`} className="row">
                            <span className="grow">
                              <span className="title">{r.description}</span>
                              <span className="sub" style={{ display: "block" }}>
                                {day(r.date)} · {catName(r.categoryId)}
                              </span>
                            </span>
                            <Money cents={r.amountCents} currency={cur} />
                          </Link>
                        ))}
                        {s.count > s.recent.length && <p className="faint">e mais {s.count - s.recent.length}…</p>}
                      </div>
                    </details>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      <h2 className="section" style={{ marginBottom: 10 }}>
        Criar e organizar
      </h2>
      <ListEditor kind="projects" items={projects} />
    </>
  );
}
