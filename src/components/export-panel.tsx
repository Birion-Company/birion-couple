"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { longMonth } from "@/lib/cards";
import { Select } from "./select";

/** Ajustes → Exportação: escolhe o mês e baixa a planilha ou abre o extrato em PDF. */
export function ExportPanel({ months, initial }: { months: string[]; initial: string }) {
  const [month, setMonth] = useState(initial);
  const label = (k: string) => longMonth(k);
  return (
    <section className="card section export-panel">
      <label className="field" style={{ maxWidth: 320 }}>
        <span>Mês</span>
        <Select value={month} onChange={setMonth} options={months.map((k) => ({ value: k, label: label(k) }))} ariaLabel="Mês para exportar" />
      </label>
      <p className="faint">
        Com cartão, o mês é o da fatura que vence nele (igual ao painel). Vai tudo: resumo, faturas, gastos por categoria, dívidas e cada lançamento.
      </p>
      <div className="export-options">
        <a className="export-option" href={`/api/exportar?mes=${month}`} download>
          <FileSpreadsheet size={28} strokeWidth={1.6} aria-hidden />
          <span>
            <strong>Planilha (Excel)</strong>
            <span className="faint">Abas de resumo, lançamentos, categorias, faturas e dívidas. Abre no Excel e no Google Planilhas.</span>
          </span>
        </a>
        <a className="export-option" href={`/exportar/${month}?imprimir=1`} target="_blank" rel="noopener">
          <FileText size={28} strokeWidth={1.6} aria-hidden />
          <span>
            <strong>PDF (extrato)</strong>
            <span className="faint">Um extrato do mês para guardar ou mandar. Abre a folha e o “Salvar como PDF”.</span>
          </span>
        </a>
      </div>
    </section>
  );
}
