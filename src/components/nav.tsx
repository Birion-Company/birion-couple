"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, CreditCard, HandCoins, LayoutGrid, Plus, ScanSearch } from "lucide-react";

const items = [
  { href: "/painel", label: "Painel", icon: LayoutGrid },
  { href: "/transacoes", label: "Lançamentos", icon: ArrowLeftRight },
  { href: "/transacoes/nova", label: "Novo", icon: Plus, add: true },
  { href: "/identificar", label: "A identificar", icon: ScanSearch, short: "Identificar" },
  { href: "/dividas", label: "Dívidas", icon: HandCoins },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
];

function isActive(path: string, href: string) {
  if (href === "/transacoes") return path === "/transacoes" || (path.startsWith("/transacoes/") && path !== "/transacoes/nova");
  return path === href || path.startsWith(href + "/");
}

/** Contador ao lado de "A identificar". */
function Count({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="nav-count" aria-label={`${n} a identificar`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function SideNav({ toIdentify = 0 }: { toIdentify?: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal">
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined} data-tour={href === "/identificar" ? "nav-identify" : undefined}>
          <Icon size={18} strokeWidth={1.6} />
          {label === "Novo" ? "Novo lançamento" : label}
          {href === "/identificar" && <Count n={toIdentify} />}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ toIdentify = 0 }: { toIdentify?: number }) {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Principal">
      {items.map(({ href, label, icon: Icon, add, short }) => (
        <Link key={href} href={href} className={add ? "add" : undefined} aria-current={isActive(path, href) ? "page" : undefined} aria-label={add ? "Novo lançamento" : undefined}>
          <span className="icon">
            <Icon size={add ? 22 : 20} strokeWidth={add ? 2 : 1.6} />
            {href === "/identificar" && <Count n={toIdentify} />}
          </span>
          <span className="label">{short ?? label}</span>
        </Link>
      ))}
    </nav>
  );
}
