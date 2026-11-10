import { redirect } from "next/navigation";

/**
 * Dívidas agora fica dentro de Lançamentos (aba "Dívidas"). O endereço antigo leva para lá.
 * (A página própria de antes está no histórico do git, se for para voltar atrás.)
 */
export default function DebtsPage() {
  redirect("/transacoes?dividas=1");
}
