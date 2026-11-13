import { redirect } from "next/navigation";

/** Contas ganharam um lugar próprio no menu lateral. */
export default function AccountsRedirect() {
  redirect("/contas");
}
