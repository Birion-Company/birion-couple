import { redirect } from "next/navigation";

/** Acerto: quem deve a quem. Mostra as dívidas em aberto (dentro de Movimentação). */
export default function SettlePage() {
  redirect("/transacoes?dividas=1");
}
