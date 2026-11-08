import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { ActivityPopup } from "@/components/activity-popup";
import { CardAlerts } from "@/components/card-alerts";
import { BottomNav, SideNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { requireAuth } from "@/lib/auth";
import { getActivityFeed } from "@/lib/activity";
import { getCardAlerts } from "@/lib/card-queries";
import { getLookups } from "@/lib/queries";

function Brand() {
  return (
    <div className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark.png" alt="" />
      <span>
        BIRION FINANCE
        
      </span>
    </div>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const auth = await requireAuth();
  const avatarUrl = auth.avatarVersion ? `/api/avatar/${auth.userId}?v=${auth.avatarVersion}` : null;
  const lookups = await getLookups(auth.householdId);
  const [alerts, activity] = await Promise.all([getCardAlerts(auth), getActivityFeed(auth, lookups, auth.currency)]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <SideNav />
        <div className="side-foot">
          <UserMenu name={auth.userName} avatarUrl={avatarUrl} />
          <div className="theme-row">
            <form action={logout} style={{ flex: 1 }}>
              <button className="btn logout-btn">
                <LogOut size={16} strokeWidth={1.8} /> Sair
              </button>
            </form>
            <ThemeToggle className="icon-btn theme-btn" />
          </div>
        </div>
      </aside>
      <div className="shell-body">
        <header className="topbar">
          <Brand />
          <span className="spacer" />
          <ThemeToggle />
          <UserMenu name={auth.userName} avatarUrl={avatarUrl} compact />
          <form action={logout}>
            
            <button className="btn small logout-btn">
              <LogOut size={15} strokeWidth={1.8} /> Sair
            </button>
          </form>
        </header>
        <main className="main">{children}</main>
      </div>
      <BottomNav />
      {/* Um popup por vez: primeiro o que mudou; o aviso de fatura aparece depois do "Entendi". */}
      {activity.length > 0 ? <ActivityPopup items={activity} /> : <CardAlerts alerts={alerts} currency={auth.currency} />}
    </div>
  );
}
