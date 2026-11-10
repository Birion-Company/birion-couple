import Link from "next/link";
import { ChevronDown, CreditCard, HandCoins, LayoutGrid, type LucideIcon } from "lucide-react";
import type { Impact, ImpactArea } from "@/lib/impact";

const ICON: Record<ImpactArea, LucideIcon> = { debts: HandCoins, card: CreditCard, panel: LayoutGrid };

/**
 * Quadro "O que este lançamento muda": o efeito em dívidas, fatura e painel.
 * Fica recolhido; o resumo mostra em quais partes do app ele mexe.
 */
export function ImpactBox({ impact }: { impact: Impact[] | null }) {
  return (
    <details className="impact" data-tour="tx-impact">
      <summary>
        <span className="impact-title">O que este lançamento muda</span>
        <span className="impact-summary faint">{impact ? impact.map((x) => x.title).join(" · ") : "preencha o valor"}</span>
        <ChevronDown size={16} strokeWidth={1.8} className="impact-chevron" aria-hidden />
      </summary>
      <div aria-live="polite" className="impact-body">
      {!impact ? (
        <p className="impact-empty">Preencha o valor para ver o efeito nas dívidas, na fatura e no painel.</p>
      ) : (
        <ul>
          {impact.map((x) => {
            const Icon = ICON[x.area];
            return (
              <li key={x.area}>
                <span className="impact-icon" aria-hidden>
                  <Icon size={15} strokeWidth={1.8} />
                </span>
                <div>
                  <Link href={x.href} className="impact-area">
                    {x.title}
                  </Link>
                  {x.lines.map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </details>
  );
}
