"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Escolha de mês e ano feita em botões (o campo "month" do navegador não existe no Firefox nem no Safari do
 * computador, e aí não dava para escolher). `min` ("2026-11") bloqueia os meses que já passaram.
 */
export function MonthPicker({ value, onChange, min, label = "Mês" }: { value: string; onChange: (v: string) => void; min: string; label?: string }) {
  const minYear = Number(min.slice(0, 4));
  const [year, setYear] = useState(() => Number((value || min).slice(0, 4)));
  const key = (m: number) => `${year}-${String(m + 1).padStart(2, "0")}`;
  return (
    <div className="mpick" role="group" aria-label={label}>
      <div className="mpick-year">
        <button type="button" className="icon-btn" aria-label="Ano anterior" disabled={year <= minYear} onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft size={16} />
        </button>
        <strong>{year}</strong>
        <button type="button" className="icon-btn" aria-label="Próximo ano" onClick={() => setYear((y) => y + 1)}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="mpick-grid">
        {NAMES.map((n, m) => (
          <button key={n} type="button" className={`mpick-m${value === key(m) ? " on" : ""}`} disabled={key(m) < min} aria-pressed={value === key(m)} onClick={() => onChange(key(m))}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
