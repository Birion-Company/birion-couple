"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Handshake, House, Plus, ScanSearch, Target, UserCheck, Wallet } from "lucide-react";

/** Menu do casal: o essencial. "A identificar" e "Para confirmar" só aparecem quando há algo esperando. */
const items = [
  { href: "/painel", label: "Início", icon: House },
  { href: "/transacoes", label: "Gastos", icon: ArrowLeftRight },
  { href: "/acerto", label: "Acerto", icon: Handshake },
  { href: "/transacoes/nova", label: "Novo", icon: Plus, add: true },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/identificar", label: "A identificar", icon: ScanSearch, short: "Identificar", whenWaiting: true },
  { href: "/confirmar", label: "Para confirmar", icon: UserCheck, short: "Confirmar", whenWaiting: true },
];

function isActive(path: string, href: string, debts: boolean) {
  if (href === "/acerto") return path === "/acerto" || (path === "/transacoes" && debts);
  if (href === "/transacoes") return !debts && (path === "/transacoes" || (path.startsWith("/transacoes/") && path !== "/transacoes/nova"));
  if (href === "/contas") return path === "/contas" || path.startsWith("/contas/") || path === "/cartoes" || path.startsWith("/cartoes/");
  return path === href || path.startsWith(href + "/");
}

/** Nome de cada item do menu para o tutorial destacar. */
const TOUR: Record<string, string> = { "/identificar": "nav-identify", "/confirmar": "nav-confirm" };

/** Contador ao lado de "A identificar" e de "Para confirmar". */
function Count({ n, what = "a identificar" }: { n: number; what?: string }) {
  if (n <= 0) return null;
  return (
    <span className="nav-count" aria-label={`${n} ${what}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function useShown(path: string, debts: boolean, toIdentify: number, toConfirm: number) {
  return items.filter(
    (x) =>
      !x.add &&
      (!x.whenWaiting ||
        (x.href === "/identificar" && toIdentify > 0) ||
        (x.href === "/confirmar" && toConfirm > 0) ||
        isActive(path, x.href, debts)),
  );
}

export function SideNav({ toIdentify = 0, toConfirm = 0 }: { toIdentify?: number; toConfirm?: number }) {
  const path = usePathname();
  const debts = useSearchParams().get("dividas") === "1";
  const shown = useShown(path, debts, toIdentify, toConfirm);
  return (
    <nav aria-label="Principal">
      {/* "Novo lançamento" fica no botão do canto da tela (no celular, no + da barra de baixo). */}
      {shown.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isActive(path, href, debts) ? "page" : undefined} data-tour={TOUR[href]}>
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
  const debts = useSearchParams().get("dividas") === "1";
  // No celular só cabem os 5 principais; "Identificar" e "Confirmar" entram quando há algo esperando.
  const shown = useShown(path, debts, toIdentify, toConfirm);
  return (
    <nav className="bottom-nav" aria-label="Principal">
      {/* O + fica no botão redondo do canto (fora da barra). */}
      {shown.map(({ href, label, icon: Icon, short }) => (
        <Link key={href} href={href} aria-current={isActive(path, href, debts) ? "page" : undefined} data-tour={TOUR[href]}>
          <span className="icon">
            <Icon size={20} strokeWidth={1.6} />
            {href === "/identificar" && <Count n={toIdentify} />}
            {href === "/confirmar" && <Count n={toConfirm} what="para confirmar" />}
          </span>
          <span className="label">{short ?? label}</span>
        </Link>
      ))}
    </nav>
  );
}
