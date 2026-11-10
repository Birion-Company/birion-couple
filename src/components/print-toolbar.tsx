"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, Printer } from "lucide-react";

/** Barra do extrato (some na impressão): salvar em PDF / imprimir e voltar. Abre o salvar sozinho. */
export function PrintToolbar({ auto }: { auto: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <div className="rep-toolbar">
      <button type="button" className="rep-btn ghost" onClick={() => (history.length > 1 ? router.back() : router.push("/ajustes/exportacao"))}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <span className="rep-hint">No salvar, escolha “Salvar como PDF”.</span>
      <button type="button" className="rep-btn" onClick={() => window.print()}>
        <Printer size={16} /> Salvar em PDF
      </button>
    </div>
  );
}
