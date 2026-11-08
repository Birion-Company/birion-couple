import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { BottomNav, SideNav } from "@/components/nav";
import { BellButton, NotificationCenter } from "@/components/notifications";
import { ThemeToggle } from "@/components/theme-toggle";
import { HelpButton, Tutorial } from "@/components/tutorial";
import { UserMenu } from "@/components/user-menu";
import { requireAuth } from "@/lib/auth";
import { getActivityFeed } from "@/lib/activity";
import { getCardAlerts } from "@/lib/card-queries";
import { countUnidentified, getLookups } from "@/lib/queries";

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
  const [alerts, activity, toIdentify] = await Promise.all([getCardAlerts(auth), getActivityFeed(auth, lookups, auth.currency, { all: true }), countUnidentified(auth)]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <SideNav toIdentify={toIdentify} />
        <div className="side-foot">
          <UserMenu name={auth.userName} household={auth.householdName} avatarUrl={avatarUrl} />
          <div className="theme-row">
            <form action={logout} style={{ flex: 1 }}>
              <button className="btn logout-btn">
                <LogOut size={16} strokeWidth={1.8} /> Sair
              </button>
            </form>
            <BellButton className="icon-btn theme-btn" />
            <HelpButton className="icon-btn theme-btn help-btn" />
            <ThemeToggle className="icon-btn theme-btn" />
          </div>
        </div>
      </aside>
      <div className="shell-body">
        <header className="topbar">
          <Brand />
          <span className="spacer" />
          <BellButton />
          <HelpButton />
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
      <BottomNav toIdentify={toIdentify} />
      <Tutorial />
      {/* Sino: avisos de fatura e o que a família fez; procura novidades sozinho. */}
      <NotificationCenter initial={activity} cardAlerts={alerts} currency={auth.currency} />
    </div>
  );
}
