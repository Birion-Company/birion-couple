import { BrandPanel } from "@/components/auth/brand-panel";
import { ThemeToggle } from "@/components/theme-toggle";

/** LoginPage e demais telas de entrada: container central dividido (marca | formulário). */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth-scene">
      <ThemeToggle className="icon-btn auth-theme" />
      <div className="auth-frame">
        <BrandPanel />
        <section className="auth-panel">
          <div className="auth-panel-logo" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" />
          </div>
          <div className="auth-box">{children}</div>
        </section>
      </div>
    </main>
  );
}
