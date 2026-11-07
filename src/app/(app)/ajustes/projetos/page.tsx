import type { Metadata } from "next";
import { ListEditor } from "@/components/list-editor";
import { requireAuth } from "@/lib/auth";
import { getLookups } from "@/lib/queries";

export const metadata: Metadata = { title: "Projetos" };

export default async function ProjectsPage() {
  const auth = await requireAuth();
  const { projects } = await getLookups(auth.householdId);
  return (
    <>
      <p className="faint" style={{ marginBottom: 12 }}>
        Projetos agrupam lançamentos de um mesmo assunto, como uma viagem, uma reforma ou uma festa, e viram filtro no painel.
      </p>
      <ListEditor kind="projects" items={projects} />
    </>
  );
}
