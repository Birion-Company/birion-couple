import { redirect } from "next/navigation";

/** Pessoas agora ficam junto com a Família. */
export default function PeopleRedirect() {
  redirect("/ajustes#familia");
}
