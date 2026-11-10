import Link from "next/link";
import { SettingsTabs } from "@/components/settings-panels";

export default function SettingsLayout({ children }: LayoutProps<"/ajustes">) {
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="muted">
            Dúvidas? Veja <Link href="/ajuda" className="pos">Como funciona</Link>.
          </p>
        </div>
      </div>
      <SettingsTabs />
      {children}
    </div>
  );
}
