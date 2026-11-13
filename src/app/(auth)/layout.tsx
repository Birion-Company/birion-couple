import { AuthScaler } from "@/components/auth/auth-scaler";
import { BrandPanel } from "@/components/auth/brand-panel";

/** LoginPage e demais telas de entrada: container central dividido (marca | formulário). */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth-scene">
      <AuthScaler />
      <div className="auth-viewport">
        <div className="auth-frame">
          <BrandPanel />
          <section className="auth-panel">
            <div className="auth-panel-logo" aria-hidden>
              <i className="bmark" aria-hidden />
            </div>
            {/* Celular: a marca e a frase ficam no mesmo bloco do login (no computador estão no painel ao lado). */}
            <div className="auth-mobile-brand">
              <p className="auth-mobile-name">
                Birion <span>Couple</span>
              </p>
              <p className="auth-mobile-tagline">
                Suas finanças, <em>sem complicação.</em>
              </p>
            </div>
            <div className="auth-box">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
