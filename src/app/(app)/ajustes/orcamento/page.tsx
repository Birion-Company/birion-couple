import { redirect } from "next/navigation";

/** O orçamento agora fica junto das categorias. */
export default function BudgetMoved() {
  redirect("/ajustes/categorias");
}
