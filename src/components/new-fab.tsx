"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

/**
 * Novo lançamento sempre à mão (canto inferior direito). Some enquanto a pessoa está lançando ou
 * editando (telas de lançamento e a janela de edição), para não confundir com o "Salvar".
 */
export function NewFab() {
  const path = usePathname();
  if (/^\/transacoes\/.+/.test(path)) return null;
  return (
    <Link href="/transacoes/nova" className="new-fab" aria-label="Novo lançamento" data-tour="new-fab">
      <Plus size={20} strokeWidth={2.2} aria-hidden /> <span>Novo lançamento</span>
    </Link>
  );
}
