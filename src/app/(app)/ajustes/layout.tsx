import { SettingsTabs } from "@/components/settings-panels";

export default function SettingsLayout({ children }: LayoutProps<"/ajustes">) {
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="muted">Tudo aqui pode ser mudado a qualquer hora, sem mexer em código.</p>
        </div>
      </div>
      <SettingsTabs />
      {children}
    </div>
  );
}
