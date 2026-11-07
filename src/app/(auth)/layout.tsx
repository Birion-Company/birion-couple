import { BarChart3, ShieldCheck, Users } from "lucide-react";
import { FinanceArt } from "@/components/finance-art";
import { ThemeToggle } from "@/components/theme-toggle";

const POINTS = [
  { icon: BarChart3, text: "Visão completa dos gastos e saldos da casa" },
  { icon: Users, text: "Divida as contas com quem mora com você" },
  { icon: ShieldCheck, text: "Seus dados sempre seguros" },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth-scene">
      <ThemeToggle className="icon-btn auth-theme" />
      <div className="auth-frame">
        <section className="auth-hero" aria-label="BIRIUN FINANCE">
          <div className="hero-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="hero-mark" />
            <span className="hero-name">
              BIRIUN <span>FINANCE</span>
            </span>
          </div>
          <h2 className="hero-title">
            Organize as finanças da família de forma <span>simples e eficiente.</span>
          </h2>
          <p className="hero-sub">Registre quem pagou, veja quem deve e acerte as contas com quem divide a casa com você.</p>
          <ul className="hero-points">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span className="hero-point-icon">
                  <Icon size={20} strokeWidth={1.8} />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <FinanceArt className="hero-art" />
        </section>
        <section className="auth-card">
          <div className="auth-card-logo" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" />
          </div>
          <div className="auth-box">{children}</div>
        </section>
      </div>
    </main>
  );
}
