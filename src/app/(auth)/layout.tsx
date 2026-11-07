import { CheckCircle2 } from "lucide-react";
import { FinanceArt } from "@/components/finance-art";

const POINTS = ["Quem pagou e quem deve, sem planilha", "Importa extratos OFX e CSV", "Tudo configurável para a sua família"];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth-split">
      <aside className="auth-hero">
        <div className="auth-hero-inner">
          <div className="hero-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/icon-512.png" alt="Logo da Biriun" className="hero-logo" />
            <div>
              <p className="hero-name">BIRIUN FINANCE</p>
              <p className="hero-tag">finanças da família em um só lugar</p>
            </div>
          </div>
          <FinanceArt className="hero-art" />
          <ul className="hero-points">
            {POINTS.map((p) => (
              <li key={p}>
                <CheckCircle2 size={16} strokeWidth={1.6} /> {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <section className="auth-panel">
        <div className="auth-box">{children}</div>
      </section>
    </main>
  );
}
