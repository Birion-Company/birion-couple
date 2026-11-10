import { redirect } from "next/navigation";

/** A importação mudou para Ajustes → Importação; o endereço antigo continua funcionando. */
export default function ImportPage() {
  redirect("/ajustes/importacao");
}
