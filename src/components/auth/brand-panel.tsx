import { BarChart3, ShieldCheck, Target } from "lucide-react";
import { FinanceArt } from "@/components/finance-art";

const BENEFITS = [
  { icon: BarChart3, text: "Visualização completa do seu financeiro" },
  { icon: Target, text: "Defina metas e acompanhe seu progresso" },
  { icon: ShieldCheck, text: "Seus dados sempre seguros" },
];

/** Painel esquerdo: marca, título, descrição, benefícios e ilustração de crescimento. */
export function BrandPanel() {
  return (
    <section className="brand-panel" aria-label="BIRIUN FINANCE">
      <svg className="brand-curves" viewBox="0 0 800 900" preserveAspectRatio="none" aria-hidden>
        <path d="M-40 380 C 220 300, 420 420, 840 240" />
        <path d="M-40 560 C 260 470, 520 600, 840 420" />
        <path d="M-40 760 C 300 640, 560 760, 840 600" />
      </svg>
      <div className="brand-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.png" alt="" />
        <span>
          BIRIUN <em>FINANCE</em>
        </span>
      </div>
      <h2 className="brand-title">
        Organize suas
        <br />
        finanças de forma
        <br />
        <em>simples e eficiente.</em>
      </h2>
      <p className="brand-desc">Controle seus gastos, acompanhe seus investimentos e conquiste seus objetivos.</p>
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
      <FinanceArt className="brand-art" />
    </section>
  );
}
