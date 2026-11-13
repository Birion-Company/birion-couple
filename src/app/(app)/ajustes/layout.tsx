import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { SettingsTabs } from "@/components/settings-panels";
import { requireAuth } from "@/lib/auth";
import { APPROVALS_OFF } from "@/lib/defaults";

export default async function SettingsLayout({ children }: LayoutProps<"/ajustes">) {
  const auth = await requireAuth();
  const [house] = await getDb().select({ from: schema.households.approvalsFrom }).from(schema.households).where(eq(schema.households.id, auth.householdId));
  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="muted">
            <Link href="/ajuda" className="pos">Como funciona</Link>
          </p>
        </div>
      </div>
      <SettingsTabs approvals={!!house && house.from.getTime() < APPROVALS_OFF.getTime()} />
      {children}
    </div>
  );
}
