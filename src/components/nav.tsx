"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, CreditCard, FolderKanban, HandCoins, LayoutGrid, Plus, ScanSearch, UserCheck } from "lucide-react";

const items = [
  { href: "/painel", label: "Painel", icon: LayoutGrid },
  { href: "/transacoes", label: "Lançamentos", icon: ArrowLeftRight },
  { href: "/transacoes/nova", label: "Novo", icon: Plus, add: true },
  { href: "/identificar", label: "A identificar", icon: ScanSearch, short: "Identificar" },
  { href: "/dividas", label: "Dívidas", icon: HandCoins },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/projetos", label: "Projetos", icon: FolderKanban, desktopOnly: true },
  { href: "/confirmar", label: "Para confirmar", icon: UserCheck, short: "Confirmar" },
];

function isActive(path: string, href: string) {
  if (href === "/transacoes") return path === "/transacoes" || (path.startsWith("/transacoes/") && path !== "/transacoes/nova");
  return path === href || path.startsWith(href + "/");
}

/** Nome de cada item do menu para o tutorial destacar. */
const TOUR: Record<string, string> = { "/identificar": "nav-identify", "/confirmar": "nav-confirm", "/projetos": "nav-projects" };

/** Contador ao lado de "A identificar" e de "Para confirmar". */
function Count({ n, what = "a identificar" }: { n: number; what?: string }) {
  if (n <= 0) return null;
  return (
    <span className="nav-count" aria-label={`${n} ${what}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function SideNav({ toIdentify = 0, toConfirm = 0 }: { toIdentify?: number; toConfirm?: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal">
      {/* "Novo lançamento" fica no botão do canto da tela (no celular, no + da barra de baixo). */}
      {items.filter((x) => !x.add).map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined} data-tour={TOUR[href]}>
          <Icon size={18} strokeWidth={1.6} />
          {label}
          {href === "/identificar" && <Count n={toIdentify} />}
          {href === "/confirmar" && <Count n={toConfirm} what="para confirmar" />}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ toIdentify = 0, toConfirm = 0 }: { toIdentify?: number; toConfirm?: number }) {
  const path = usePathname();
  // No celular, "Confirmar" só entra na barra quando há algo esperando (ou quando você está nela).
  // Projetos fica no menu da conta no celular (a barra de baixo já tem 5 itens).
  const shown = items.filter((x) => !x.add && !("desktopOnly" in x && x.desktopOnly) && (x.href !== "/confirmar" || toConfirm > 0 || isActive(path, x.href)));
  return (
    <nav className="bottom-nav" aria-label="Principal">
      {/* O + fica no botão redondo do canto (fora da barra). */}
      {shown.map(({ href, label, icon: Icon, add, short }) => (
        <Link key={href} href={href} className={add ? "add" : undefined} aria-current={isActive(path, href) ? "page" : undefined} aria-label={add ? "Novo lançamento" : undefined} data-tour={TOUR[href]}>
          <span className="icon">
            <Icon size={add ? 22 : 20} strokeWidth={add ? 2 : 1.6} />
            {href === "/identificar" && <Count n={toIdentify} />}
            {href === "/confirmar" && <Count n={toConfirm} what="para confirmar" />}
          </span>
          <span className="label">{short ?? label}</span>
        </Link>
      ))}
    </nav>
  );
}
