import Link from "next/link";
import { Clock3, CreditCard, HandCoins, LayoutGrid, type LucideIcon } from "lucide-react";
import type { Impact, ImpactArea } from "@/lib/impact";

const ICON: Record<ImpactArea, LucideIcon> = { debts: HandCoins, card: CreditCard, panel: LayoutGrid, pending: Clock3 };

/** Quadro "O que este lançamento muda": o efeito em dívidas, fatura, painel e pendentes. */
export function ImpactBox({ impact }: { impact: Impact[] | null }) {
  return (
    <section className="impact" aria-labelledby="impact-title" aria-live="polite" data-tour="tx-impact">
      <h3 id="impact-title">O que este lançamento muda</h3>
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
    </section>
  );
}
