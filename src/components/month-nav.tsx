"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Sparkles, Undo2 } from "lucide-react";
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
  max,
  hasCards = false,
  detail = null,
}: {
  filters: Filters;
  month: string;
  current: string;
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

  const go = (key: string) => {
    // De hoje para frente: não volta para antes da fatura em aberto (ou do mês atual).
    if (key > max || key < current) return;
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
        disabled={shown <= current}
        aria-label={shown <= current ? "O painel mostra de hoje para frente" : `Ver ${longMonth(addMonthsKey(shown, -1))}`}
        title={shown <= current ? "O painel mostra de hoje para frente" : undefined}
      >
        <ChevronLeft size={22} strokeWidth={2} />
      </button>
      <div className="month-center" aria-live="polite">
        <span className={`month-badge ${badge.cls}`}>
          {badge.cls === "future" ? <Sparkles size={12} strokeWidth={2.2} aria-hidden /> : <CalendarDays size={12} strokeWidth={2.2} aria-hidden />} {badge.text}
        </span>
        <h2 className="month-title">
          {title}
          {pending && <Loader2 size={18} className="spin" aria-label="Carregando" />}
        </h2>
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
