import { NewFab } from "@/components/new-fab";
import { BottomNav, SideNav } from "@/components/nav";
import { BellButton, NotificationCenter } from "@/components/notifications";
import { HelpButton, Tutorial } from "@/components/tutorial";
import { UserMenu } from "@/components/user-menu";
import { requireAuth } from "@/lib/auth";
import { getActivityFeed } from "@/lib/activity";
import { getCardAlerts } from "@/lib/card-queries";
import { countUnidentified, getApprovalInbox, getLookups, getLookupsFor } from "@/lib/queries";
import { TxModalHost } from "@/components/tx-modal";
import { NavProgress } from "@/components/nav-progress";
import { BackToTop } from "@/components/back-to-top";
import { ScrollReveal } from "@/components/scroll-reveal";

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
  // O par (outra pessoa com login no casal): aparece no rodapé do menu, ao lado de você.
  const pp = lookups.participants.find((p) => p.hasLogin && p.id !== auth.participantId && !p.archived);
  const partner = pp ? { name: pp.name, color: pp.color, avatarUrl: pp.avatarUrl ?? null } : null;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <SideNav toIdentify={toIdentify} toConfirm={toConfirm} couple={!!partner} />
        <div className="side-foot">
          <UserMenu name={auth.userName} household={auth.householdName} avatarUrl={avatarUrl} partner={partner} />
        </div>
      </aside>
      <div className="shell-body">
        {/* Barra de cima (estilo Waybar): marca à esquerda, módulos à direita. */}
        <header className="topbar">
          <Brand />
          {/* Centro da barra: o seletor de mês das páginas que mostram um mês por vez. */}
          <div id="topbar-month" className="topbar-center" />
          <HelpButton />
          <div className="wb-group" role="group" aria-label="Notificações">
            <BellButton />
          </div>
          <span className="wb-user">
            <UserMenu name={auth.userName} avatarUrl={avatarUrl} compact />
          </span>
        </header>
        <NavProgress />
        <main className="main">{children}</main>
      </div>
      <BottomNav toIdentify={toIdentify} toConfirm={toConfirm} couple={!!partner} />
      {/* Novo lançamento sempre à mão: botão no canto inferior direito (no celular, é o + da barra de baixo). */}
      <NewFab />
      <ScrollReveal />
      <BackToTop />
      <Tutorial autoOpen={!auth.tourSeenAt} />
      {/* Clicar num lançamento abre a edição numa janela, sem sair da página. */}
      <TxModalHost lookups={myLookups} currency={auth.currency} me={auth.participantId} />
      {/* Sino: avisos de fatura e o que a família fez; procura novidades sozinho. */}
      <NotificationCenter initial={activity} cardAlerts={alerts} currency={auth.currency} />
    </div>
  );
}
