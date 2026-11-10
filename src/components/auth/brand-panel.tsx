import { BarChart3, ShieldCheck, Target } from "lucide-react";

const BENEFITS = [
  { icon: BarChart3, text: "Visualização completa do seu financeiro" },
  { icon: Target, text: "Defina metas e acompanhe seu progresso" },
  { icon: ShieldCheck, text: "Seus dados sempre seguros" },
];

/** Painel esquerdo: marca, título, descrição e benefícios. */
export function BrandPanel() {
  return (
    <section className="brand-panel" aria-label="BIRION FINANCE">
      <div className="brand-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.png" alt="" />
        <span>
          BIRION <em>FINANCE</em>
        </span>
      </div>
      <div className="brand-content">
        <div className="brand-copy">
          <h2 className="brand-title">
            Organize suas
            {" "}<br />
            finanças de forma
            {" "}<br />
            <em>simples e eficiente.</em>
          </h2>
          <p className="brand-desc">
            Controle seus gastos, acompanhe seus investimentos e conquiste seus objetivos.
          </p>
        </div>
        <ul className="brand-benefits">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text}>
              <span className="brand-benefit-icon">
                <Icon size={26} strokeWidth={2} />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
