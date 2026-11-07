import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { BottomNav, SideNav } from "@/components/nav";
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
          <p className="faint">{auth.userName}</p>
          <form action={logout}>
            <button className="btn ghost small" style={{ paddingLeft: 0 }}>
              <LogOut size={15} strokeWidth={1.6} /> Sair
            </button>
          </form>
        </div>
      </aside>
      <div className="shell-body">
        <header className="topbar">
          <Brand household={auth.householdName} />
          <span className="spacer" />
          <form action={logout}>
            <button className="icon-btn" aria-label="Sair" title="Sair">
              <LogOut size={18} strokeWidth={1.6} />
            </button>
          </form>
        </header>
        <main className="main">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
