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
      <ListEditor kind="projects" items={projects} />
    </>
  );
}
