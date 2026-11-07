import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { BottomNav, SideNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { requireAuth } from "@/lib/auth";

function Brand({ household }: { household: string }) {
  return (
    <div className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark.png" alt="" />
      <span>
        BIRIUN FINANCE
        <small>{household}</small>
      </span>
    </div>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const auth = await requireAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand household={auth.householdName} />
        <SideNav />
        <div className="side-foot">
          <UserMenu name={auth.userName} email={auth.email} />
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
          <Brand household={auth.householdName} />
          <span className="spacer" />
          <ThemeToggle />
          <UserMenu name={auth.userName} email={auth.email} compact />
          <form action={logout}>
            <button className="btn small logout-btn">
              <LogOut size={15} strokeWidth={1.8} /> Sair
            </button>
          </form>
        </header>
        <main className="main">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
