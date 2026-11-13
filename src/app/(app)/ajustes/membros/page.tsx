import { redirect } from "next/navigation";

/** Acesso e convite agora ficam em "Nós". */
export default function MembersMoved() {
  redirect("/ajustes");
}
