import { redirect } from "next/navigation";

/** "Status" só informa (não muda nada): mora em Como funciona. Endereço antigo leva para lá. */
export default function StatusPage() {
  redirect("/ajuda#status");
}
