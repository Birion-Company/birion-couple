"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Loader2, Sparkles, Undo2 } from "lucide-react";
import { addMonthsKey, longMonth, monthsBetween } from "@/lib/cards";
import { filtersToQuery, type Filters } from "@/lib/filters";

/**
 * Navegador de mês do painel: o mês que está sendo visto, em destaque, com setas. O sistema olha de hoje
 * para frente: começa na fatura em aberto (ou no mês atual) e vai até 12 meses à frente, sem voltar. Tudo no painel muda junto; o selo diz se é o mês atual, passado ou previsão.
 */
export function MonthNav({
  filters,
  month,
  current,
  min,
  max,
  hasCards = false,
  detail = null,
}: {
  filters: Filters;
  month: string;
  current: string;
  /** Primeiro mês em que dá para ver (quando a família começou a usar o app). */
  min: string;
  max: string;
  /** Com cartão, o mês é o da fatura que vence nele: o título vira "Fatura de novembro". */
  hasCards?: boolean;
  /** Linha embaixo do título: o vencimento de cada fatura do mês ("Cartão A vence 10/11 · paga"). */
  detail?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  // Mostra o mês novo na hora, enquanto os números carregam.
  const [target, setTarget] = useState<string | null>(null);
  const shown = pending && target ? target : month;
  const [picking, setPicking] = useState(false);

  const go = (key: string) => {
    if (key > max || key < min) return;
    setPicking(false);
    setTarget(key);
    start(() => router.push(pathname + filtersToQuery({ ...filters, month: key === current ? null : key, period: "mes" }, "mes"), { scroll: false }));
  };
  const diff = monthsBetween(current, shown);
  const monthName = (key: string) => {
    const s = longMonth(key);
    return key.slice(0, 4) === new Date().getFullYear().toString() ? s.replace(/ de \d{4}$/, "") : s;
  };
  const title = hasCards ? `Fatura de ${monthName(shown).toLowerCase()}` : longMonth(shown);
  const badge =
    diff === 0
      ? { cls: "now", text: hasCards ? "A pagar agora" : "Este mês" }
      : diff > 0
        ? { cls: "future", text: diff === 1 ? "Próxima · previsão" : `Daqui a ${diff} meses · previsão` }
        : { cls: "past", text: diff === -1 ? "Anterior" : `Há ${-diff} meses` };

  return (
    <section
      className={`month-nav ${badge.cls} ${pending ? "loading" : ""}`}
      aria-label="Mês que o painel mostra"
      data-tour="dash-month"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(addMonthsKey(shown, -1));
        if (e.key === "ArrowRight") go(addMonthsKey(shown, 1));
      }}
    >
      <button
        type="button"
        className="month-arrow"
        onClick={() => go(addMonthsKey(shown, -1))}
        disabled={shown <= min}
        aria-label={shown <= min ? "Antes disso você ainda não usava o app" : `Ver ${longMonth(addMonthsKey(shown, -1))}`}
        title={shown <= min ? "Antes disso você ainda não usava o app" : undefined}
      >
        <ChevronLeft size={22} strokeWidth={2} />
      </button>
      <div className="month-center" aria-live="polite">
        <span className={`month-badge ${badge.cls}`}>
          {badge.cls === "future" ? <Sparkles size={12} strokeWidth={2.2} aria-hidden /> : <CalendarDays size={12} strokeWidth={2.2} aria-hidden />} {badge.text}
        </span>
        <h2 className="month-title">
          {/* Tocar no título abre o seletor de mês e ano. */}
          <button type="button" className="month-pick-btn" aria-expanded={picking} aria-haspopup="dialog" onClick={() => setPicking((o) => !o)}>
            {title}
            {pending ? <Loader2 size={18} className="spin" aria-label="Carregando" /> : <ChevronDown size={18} strokeWidth={2.2} className="month-pick-chevron" aria-hidden />}
          </button>
        </h2>
        {picking && <MonthPicker value={shown} current={current} min={min} max={max} onPick={go} onClose={() => setPicking(false)} />}
        {detail && !pending && <p className="month-detail">{detail}</p>}
        {diff !== 0 && (
          <button type="button" className="month-today" onClick={() => go(current)}>
            <Undo2 size={14} strokeWidth={2} aria-hidden /> Voltar para {hasCards ? "a fatura em aberto" : monthName(current).toLowerCase()}
          </button>
        )}
      </div>
      <button
        type="button"
        className="month-arrow"
        onClick={() => go(addMonthsKey(shown, 1))}
        disabled={shown >= max}
        aria-label={shown >= max ? "Dá para ver até 12 meses à frente" : `Ver ${longMonth(addMonthsKey(shown, 1))}`}
        title={shown >= max ? "Dá para ver até 12 meses à frente" : undefined}
      >
        <ChevronRight size={22} strokeWidth={2} />
      </button>
    </section>
  );
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Seletor de mês e ano: um ano por vez, com os meses fora do período bloqueados. */
function MonthPicker({ value, current, min, max, onPick, onClose }: { value: string; current: string; min: string; max: string; onPick: (key: string) => void; onClose: () => void }) {
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const box = useRef<HTMLDivElement>(null);
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!box.current?.contains(t) && !t.closest(".month-pick-btn")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>("[aria-current=true], .mp-month:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={box} className="month-picker" role="dialog" aria-label="Escolher mês">
      <div className="mp-head">
        <button type="button" className="icon-btn" disabled={year <= minYear} onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
          <ChevronLeft size={18} />
        </button>
        <strong className="num">{year}</strong>
        <button type="button" className="icon-btn" disabled={year >= maxYear} onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="mp-grid">
        {MONTHS.map((m, i) => {
          const key = `${year}-${String(i + 1).padStart(2, "0")}`;
          const off = key < min || key > max;
          return (
            <button
              key={key}
              type="button"
              className={`mp-month ${key === value ? "on" : ""} ${key === current ? "now" : ""}`}
              disabled={off}
              aria-current={key === value ? "true" : undefined}
              title={key < min ? "Antes disso você ainda não usava o app" : key > max ? "Dá para ver até 12 meses à frente" : undefined}
              onClick={() => onPick(key)}
            >
              {m}
            </button>
          );
        })}
      </div>
      <p className="faint mp-note">Do mês em que você começou a usar o app até 12 meses à frente.</p>
    </div>
  );
}
