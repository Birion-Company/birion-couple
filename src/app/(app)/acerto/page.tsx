import { redirect } from "next/navigation";

/** Acerto: quem deve a quem. Mostra as dívidas em aberto (aba dentro de Gastos). */
export default function SettlePage() {
  redirect("/transacoes?dividas=1");
}
