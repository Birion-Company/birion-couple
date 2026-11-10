"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { longMonth } from "@/lib/cards";
import { MonthPicker } from "./month-nav";

/** Ajustes → Exportação: escolhe o mês e baixa a planilha ou abre o extrato em PDF. */
export function ExportPanel({ min, max, initial, current }: { min: string; max: string; initial: string; current: string }) {
  const [month, setMonth] = useState(initial);
  const [picking, setPicking] = useState(false);
  return (
    <section className="card section export-panel">
      {/* Mesmo calendário do seletor de mês da barra de cima: um ano por vez, meses sem dados desligados. */}
      <div className="field export-month">
        <span id="export-month-label">Mês</span>
        <button
          type="button"
          className="input month-pick-btn export-month-btn"
          aria-labelledby="export-month-label"
          aria-expanded={picking}
          aria-haspopup="dialog"
          onClick={() => setPicking((o) => !o)}
        >
          <CalendarDays size={16} strokeWidth={1.9} aria-hidden />
          <span className="grow">{longMonth(month)}</span>
          <ChevronDown size={16} strokeWidth={2.2} aria-hidden />
        </button>
        {picking && (
          <MonthPicker
            value={month}
            current={current}
            min={min}
            max={max}
            strict
            note="Do mês em que você começou a usar o app até o último mês com algo lançado."
            onPick={(k) => {
              setMonth(k);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </div>
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
