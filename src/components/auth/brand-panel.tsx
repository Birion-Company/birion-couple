import { CreditCard, ShieldCheck, Users } from "lucide-react";

const BENEFITS = [
  { icon: Users, text: "Quem pagou e quem deve, sem planilha" },
  { icon: CreditCard, text: "Faturas, parcelas e contas fixas no lugar certo" },
  { icon: ShieldCheck, text: "Cada pessoa vê só o que é dela" },
];

/** Painel esquerdo: marca, título, descrição e benefícios. */
export function BrandPanel() {
  return (
    <section className="brand-panel" aria-label="Birion Finance">
      <div className="brand-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.png" alt="" />
        <span>
          Birion <em>Finance</em>
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
            Controle seus gastos, divida as contas da família e importe o extrato do banco.
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
