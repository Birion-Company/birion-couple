import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CountMoney } from "@/components/count-money";
import { Money } from "@/components/ui";
import { statement } from "@/lib/statement";

/** Extrato do mês, no jeito de um fluxo de caixa: saldo inicial, receitas, despesas e saldo final. */
export function MonthStatement({ input, monthName, currency }: { input: Parameters<typeof statement>[0]; monthName: string; currency: string }) {
  const s = statement(input);
  const tone = (c: number) => (c < 0 ? "neg" : "");
  return (
    <section className="card statement hero-statement" aria-labelledby="extrato">
      <h2 id="extrato" className="sr-only">Extrato de {monthName}</h2>
      <div className="statement-grid">
        <div className="st-cell rise" style={{ "--i": 0 } as React.CSSProperties}>
          <span className="st-label">Saldo inicial</span>
          <strong className={`st-value ${tone(s.initial)}`}><CountMoney cents={s.initial} currency={currency} /></strong>
        </div>
        <div className="st-cell rise" style={{ "--i": 1 } as React.CSSProperties}>
          <span className="st-label">Receitas</span>
          <strong className="st-value pos">+ <CountMoney cents={s.income} currency={currency} /></strong>
        </div>
        <div className="st-cell rise" style={{ "--i": 2 } as React.CSSProperties}>
          <span className="st-label">Despesas</span>
          <strong className="st-value neg">− <CountMoney cents={s.spent} currency={currency} /></strong>
        </div>
        <div className="st-cell st-final rise" style={{ "--i": 3 } as React.CSSProperties}>
          <span className="st-label">Saldo final</span>
          <strong className={`st-value ${tone(s.final)}`}><CountMoney cents={s.final} currency={currency} duration={1500} /></strong>
        </div>
      </div>
      {s.hasGap && (
        <div className="st-gap rise" style={{ "--i": 4 } as React.CSSProperties}>
          <div className="st-gap-rows">
            {s.owedToMe > 0 && (
              <p>
                <span>Te devem ainda neste mês</span>
                <strong><Money cents={s.owedToMe} currency={currency} /></strong>
              </p>
            )}
            {s.iOwe > 0 && (
              <p>
                <span>Você ainda deve</span>
                <strong><Money cents={s.iOwe} currency={currency} /></strong>
              </p>
            )}
          </div>
          <div className="st-gap-result">
            <p>
              <span>Saldo final sem acertar</span>
              <strong className={tone(s.inPocket)}><Money cents={s.inPocket} currency={currency} /></strong>
            </p>
            <p>
              <span>Saldo final com tudo acertado</span>
              <strong className={tone(s.settled)}><Money cents={s.settled} currency={currency} /></strong>
            </p>
          </div>
          <Link href="/transacoes?dividas=1" className="faint">
            Ver acerto <ArrowRight size={13} style={{ verticalAlign: -2 }} />
          </Link>
        </div>
      )}
    </section>
  );
}
