"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { longMonth } from "@/lib/cards";
import { MonthPicker } from "./month-nav";
import { PeoplePicker, type PickPerson } from "./people-picker";

/** Ajustes → Exportação: escolhe o mês e baixa a planilha ou abre o extrato em PDF. */
export function ExportPanel({
  min,
  max,
  initial,
  current,
  people,
  me,
}: {
  min: string;
  max: string;
  initial: string;
  current: string;
  people: PickPerson[];
  me: string | null;
}) {
  const [month, setMonth] = useState(initial);
  // De quem é o extrato: o seu, ou o de outra pessoa (para mandar a quem te deve e não tem login).
  const [who, setWho] = useState(me ?? "");
  const other =
    who && who !== me ? (people.find((p) => p.id === who) ?? null) : null;
  const q = other ? `&pessoa=${other.id}` : "";
  const [picking, setPicking] = useState(false);
  return (
    <section className="card section export-panel">
      {/* Mesmo calendário do seletor de mês da barra de cima: um ano por vez, meses sem dados desligados. */}
      <div className="export-fields">
        <div className="field export-who" data-tour="export-who">
          <span className="label-text">De quem é o extrato</span>
          <PeoplePicker
            people={people}
            value={who ? [who] : []}
            onChange={(ids) => setWho(ids[0] ?? me ?? "")}
            ariaLabel="De quem é o extrato"
            me={me}
          />
        </div>
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
      </div>
      <p className="faint">
        {other
          ? `Extrato de ${other.name}: os gastos dela(e) por categoria, os lançamentos que envolvem ${other.name} e a dívida entre vocês, com o que forma cada valor. Sai com o nome e a foto de ${other.name} e os seus, para mandar ${other.hasLogin ? "" : "(ela(e) não tem login) "}por WhatsApp ou e-mail.`
          : "Com cartão, o mês é o da fatura que vence nele (igual ao painel). Vai tudo: resumo, faturas, gastos por categoria, dívidas e cada lançamento, com o seu nome e a sua foto."}
      </p>
      <div className="export-options" data-tour="export-files">
        <a
          className="export-option"
          href={`/api/exportar?mes=${month}${q}`}
          download
        >
          <FileSpreadsheet size={28} strokeWidth={1.6} aria-hidden />
          <span>
            <strong>Planilha (Excel)</strong>
            <span className="faint">
              Abas de resumo, lançamentos, categorias, faturas e dívidas. Abre
              no Excel e no Google Planilhas.
            </span>
          </span>
        </a>
        <a
          className="export-option"
          href={`/exportar/${month}?imprimir=1${q}`}
        >
          <FileText size={28} strokeWidth={1.6} aria-hidden />
          <span>
            <strong>PDF (extrato)</strong>
            <span className="faint">
              Um extrato do mês para guardar ou mandar. Abre a folha e o “Salvar
              como PDF”.
            </span>
          </span>
        </a>
      </div>
    </section>
  );
}
