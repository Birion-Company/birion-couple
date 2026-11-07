import { AuthScaler } from "@/components/auth/auth-scaler";
import { BrandPanel } from "@/components/auth/brand-panel";
import { ThemeToggle } from "@/components/theme-toggle";

/** LoginPage e demais telas de entrada: container central dividido (marca | formulário). */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth-scene">
      <AuthScaler />
      <div className="auth-viewport">
        <div className="auth-frame">
          <ThemeToggle className="auth-theme" />
          <BrandPanel />
          <section className="auth-panel">
            <div className="auth-panel-logo" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/mark.png" alt="" />
            </div>
            <div className="auth-box">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
