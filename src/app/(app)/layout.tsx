import { NewFab } from "@/components/new-fab";
import { BottomNav, SideNav } from "@/components/nav";
import { BellButton, NotificationCenter } from "@/components/notifications";
import { PaletteToggle, ThemeToggle } from "@/components/theme-toggle";
import { HelpButton, Tutorial } from "@/components/tutorial";
import { UserMenu } from "@/components/user-menu";
import { requireAuth } from "@/lib/auth";
import { getActivityFeed } from "@/lib/activity";
import { getCardAlerts } from "@/lib/card-queries";
import { countUnidentified, getApprovalInbox, getLookups, getLookupsFor } from "@/lib/queries";
import { TxModalHost } from "@/components/tx-modal";
import { NavProgress } from "@/components/nav-progress";

function Brand() {
  return (
    <div className="brand">
      <i className="blogo" aria-hidden />
      <span className="brand-fin">Couple</span>
    </div>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const auth = await requireAuth();
  const avatarUrl = auth.avatarVersion ? `/api/avatar/${auth.userId}?v=${auth.avatarVersion}` : null;
  const [lookups, myLookups] = await Promise.all([getLookups(auth.householdId, auth.userId), getLookupsFor(auth)]);
  const [alerts, activity, toIdentify, inbox] = await Promise.all([
    getCardAlerts(auth),
    getActivityFeed(auth, lookups, auth.currency, { all: true }),
    countUnidentified(auth),
    getApprovalInbox(auth),
  ]);
  const toConfirm = inbox.toMe.length;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <SideNav toIdentify={toIdentify} toConfirm={toConfirm} />
        <div className="side-foot">
          <UserMenu name={auth.userName} household={auth.householdName} avatarUrl={avatarUrl} />
        </div>
      </aside>
      <div className="shell-body">
        {/* Barra de cima (estilo Waybar): marca à esquerda, módulos à direita. */}
        <header className="topbar">
          <Brand />
          {/* Centro da barra: o seletor de mês das páginas que mostram um mês por vez. */}
          <div id="topbar-month" className="topbar-center" />
          <HelpButton />
          <div className="wb-group" role="group" aria-label="Notificações e tema">
            <BellButton />
            <PaletteToggle />
            <ThemeToggle />
          </div>
          <span className="wb-user">
            <UserMenu name={auth.userName} avatarUrl={avatarUrl} compact />
          </span>
        </header>
        <NavProgress />
        <main className="main">{children}</main>
      </div>
      <BottomNav toIdentify={toIdentify} toConfirm={toConfirm} />
      {/* Novo lançamento sempre à mão: botão no canto inferior direito (no celular, é o + da barra de baixo). */}
      <NewFab />
      <Tutorial autoOpen={!auth.tourSeenAt} />
      {/* Clicar num lançamento abre a edição numa janela, sem sair da página. */}
      <TxModalHost lookups={myLookups} currency={auth.currency} me={auth.participantId} />
      {/* Sino: avisos de fatura e o que a família fez; procura novidades sozinho. */}
      <NotificationCenter initial={activity} cardAlerts={alerts} currency={auth.currency} />
    </div>
  );
}
