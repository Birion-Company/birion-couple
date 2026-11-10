import { redirect } from "next/navigation";

/** Projetos saíram de Ajustes: agora ficam no menu lateral. */
export default function OldProjectsPage() {
  redirect("/projetos");
}
