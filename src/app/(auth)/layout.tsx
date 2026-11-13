import { AuthScaler } from "@/components/auth/auth-scaler";
import { BrandPanel } from "@/components/auth/brand-panel";
import { PaletteToggle, ThemeToggle } from "@/components/theme-toggle";

/** LoginPage e demais telas de entrada: container central dividido (marca | formulário). */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth-scene">
      <AuthScaler />
      <div className="auth-viewport">
        <div className="auth-frame">
          <div className="auth-theme auth-theme-desktop auth-theme-row"><PaletteToggle /><ThemeToggle className="icon-btn" /></div>
          <BrandPanel />
          <section className="auth-panel">
            {/* Celular: o tema fica dentro do bloco, no canto. */}
            <div className="auth-theme auth-theme-mobile auth-theme-row"><PaletteToggle /><ThemeToggle className="icon-btn" /></div>
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
