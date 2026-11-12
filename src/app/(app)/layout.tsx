import { redirect } from "next/navigation";
import { NewFab } from "@/components/new-fab";
import { BottomNav, SideNav } from "@/components/nav";
import { BellButton, NotificationCenter } from "@/components/notifications";
import { ThemeToggle } from "@/components/theme-toggle";
import { HelpButton, Tutorial } from "@/components/tutorial";
import { UserMenu } from "@/components/user-menu";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getActivityFeed } from "@/lib/activity";
import { getCardAlerts } from "@/lib/card-queries";
import { countUnidentified, getApprovalInbox, getLookups, getLookupsFor } from "@/lib/queries";
import { TxModalHost } from "@/components/tx-modal";
import { NavProgress } from "@/components/nav-progress";

function Brand() {
  return (
    <div className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark.png" alt="" />
      <span>
        Birion Finance
        
      </span>
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
  // Tutorial: abre sozinho só no primeiro acesso da conta (pelo Google ou por e-mail e senha), em qualquer aparelho.
  const [me] = await getDb()
    .select({ tourSeenAt: schema.users.tourSeenAt, emailVerifiedAt: schema.users.emailVerifiedAt })
    .from(schema.users)
    .where(eq(schema.users.id, auth.userId))
    .limit(1);
  // Conta criada com e-mail e senha: só usa o app depois de confirmar o e-mail com o código.
  if (me && !me.emailVerifiedAt) redirect("/verificar-email");
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
      <Tutorial autoOpen={!me?.tourSeenAt} />
      {/* Clicar num lançamento abre a edição numa janela, sem sair da página. */}
      <TxModalHost lookups={myLookups} currency={auth.currency} me={auth.participantId} />
      {/* Sino: avisos de fatura e o que a família fez; procura novidades sozinho. */}
      <NotificationCenter initial={activity} cardAlerts={alerts} currency={auth.currency} />
    </div>
  );
}
