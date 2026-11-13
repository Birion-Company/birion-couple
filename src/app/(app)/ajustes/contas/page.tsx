import { redirect } from "next/navigation";

/** Contas moraram em Ajustes por um tempo; agora ficam junto com os cartões. */
export default function AccountsRedirect() {
  redirect("/cartoes#contas");
}
