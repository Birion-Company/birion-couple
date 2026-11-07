"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, CreditCard, LayoutGrid, Plus, Upload } from "lucide-react";

const items = [
  { href: "/painel", label: "Painel", icon: LayoutGrid },
  { href: "/transacoes", label: "Lançamentos", icon: ArrowLeftRight },
  { href: "/transacoes/nova", label: "Novo", icon: Plus, add: true },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/importar", label: "Importar", icon: Upload },
];

function isActive(path: string, href: string) {
  if (href === "/transacoes") return path === "/transacoes" || (path.startsWith("/transacoes/") && path !== "/transacoes/nova");
  return path === href || path.startsWith(href + "/");
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal">
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined}>
          <Icon size={18} strokeWidth={1.6} />
          {label === "Novo" ? "Novo lançamento" : label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Principal">
      {items.map(({ href, label, icon: Icon, add }) => (
        <Link key={href} href={href} className={add ? "add" : undefined} aria-current={isActive(path, href) ? "page" : undefined} aria-label={add ? "Novo lançamento" : undefined}>
          <span className="icon">
            <Icon size={add ? 22 : 20} strokeWidth={add ? 2 : 1.6} />
          </span>
          <span className="label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
