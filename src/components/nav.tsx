"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeftRight, CreditCard, Handshake, Heart, House, Plus, ScanSearch, Target, UserCheck } from "lucide-react";

/** Menu do casal: o essencial. "A identificar" e "Para confirmar" só aparecem quando há algo esperando. */
const items = [
  { href: "/painel", label: "Início", icon: House },
  { href: "/nos", label: "Nós dois", icon: Heart, short: "Nós" },
  { href: "/transacoes", label: "Movimentação", icon: ArrowLeftRight, short: "Movim." },
  { href: "/acerto", label: "Acerto", icon: Handshake },
  { href: "/transacoes/nova", label: "Novo", icon: Plus, add: true },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/identificar", label: "A identificar", icon: ScanSearch, short: "Identificar", whenWaiting: true },
  { href: "/confirmar", label: "Para confirmar", icon: UserCheck, short: "Confirmar", whenWaiting: true },
];

function isActive(path: string, href: string, debts: boolean) {
  if (href === "/acerto") return path === "/acerto" || (path === "/transacoes" && debts);
  if (href === "/transacoes") return !debts && (path === "/transacoes" || (path.startsWith("/transacoes/") && path !== "/transacoes/nova"));
  return path === href || path.startsWith(href + "/");
}

/** Nome de cada item do menu para o tutorial destacar. */
const TOUR: Record<string, string> = {
  "/painel": "nav-home",
  "/nos": "nav-nos",
  "/transacoes": "nav-mov",
  "/acerto": "nav-acerto",
  "/cartoes": "nav-cartoes",
  "/metas": "nav-metas",
  "/identificar": "nav-identify",
  "/confirmar": "nav-confirm",
};

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

/**
 * A categoria do menu muda no instante do toque, antes de a tela nova chegar (no site ela vem do servidor):
 * guarda o link tocado e o usa como "ativo" até a rota de fato mudar.
 */
function useTapped(path: string, debts: boolean) {
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const here = `${path}|${debts ? 1 : 0}`;
  useEffect(() => {
    // Chegou na tela nova (ou o toque não levou a lugar nenhum em 15 s): volta a seguir a rota.
    if (!tapped) return;
    if (tapped.from !== here) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTapped(null);
      return;
    }
    const t = window.setTimeout(() => setTapped(null), 15000);
    return () => window.clearTimeout(t);
  }, [tapped, here]);
  const tap = (href: string) => (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    setTapped({ href, from: here });
  };
  return { tapped: tapped && tapped.from === here ? tapped.href : null, tap };
}

/** Sem par conectado, o item do casal convida a habilitar o modo casal. */
const coupleLabel = (href: string, label: string, short: string | undefined, couple: boolean) =>
  href === "/nos" && !couple ? { label: "Modo casal", short: "Casal" } : { label, short };

export function SideNav({ toIdentify = 0, toConfirm = 0, couple = true }: { toIdentify?: number; toConfirm?: number; couple?: boolean }) {
  const path = usePathname();
  const debts = useSearchParams().get("dividas") === "1";
  const shown = useShown(path, debts, toIdentify, toConfirm);
  const { tapped, tap } = useTapped(path, debts);
  const on = (href: string) => (tapped ? tapped === href : isActive(path, href, debts));
  return (
    <nav aria-label="Principal">
      {/* "Novo lançamento" fica no botão do canto da tela (no celular, no + da barra de baixo). */}
      {shown.map(({ href, label, icon: Icon, short }) => (
        <Link key={href} href={href} aria-current={on(href) ? "page" : undefined} onClick={tap(href)} data-tour={TOUR[href]}>
          <Icon size={18} strokeWidth={1.6} />
          {coupleLabel(href, label, short, couple).label}
          {href === "/identificar" && <Count n={toIdentify} />}
          {href === "/confirmar" && <Count n={toConfirm} what="para confirmar" />}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ toIdentify = 0, toConfirm = 0, couple = true }: { toIdentify?: number; toConfirm?: number; couple?: boolean }) {
  const path = usePathname();
  const debts = useSearchParams().get("dividas") === "1";
  // No celular só cabem os 5 principais; "Identificar" e "Confirmar" entram quando há algo esperando.
  const shown = useShown(path, debts, toIdentify, toConfirm);
  const { tapped, tap } = useTapped(path, debts);
  const on = (href: string) => (tapped ? tapped === href : isActive(path, href, debts));
  return (
    <nav className="bottom-nav" aria-label="Principal">
      {/* O + fica no botão redondo do canto (fora da barra). */}
      {shown.map(({ href, label, icon: Icon, short }) => (
        <Link key={href} href={href} aria-current={on(href) ? "page" : undefined} onClick={tap(href)} data-tour={TOUR[href]}>
          <span className="icon">
            <Icon size={20} strokeWidth={1.6} />
            {href === "/identificar" && <Count n={toIdentify} />}
            {href === "/confirmar" && <Count n={toConfirm} what="para confirmar" />}
          </span>
          <span className="label">{(() => { const c = coupleLabel(href, label, short, couple); return c.short ?? c.label; })()}</span>
        </Link>
      ))}
    </nav>
  );
}
