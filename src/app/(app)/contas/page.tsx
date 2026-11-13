import { redirect } from "next/navigation";

/** Contas saíram do app: o que importa são as faturas dos cartões. */
export default function AccountsGone() {
  redirect("/cartoes");
}
