"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, CircleHelp, FolderKanban, LogOut, Settings2, UserRound } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Avatar } from "./ui";

const ITEMS = [
  { href: "/perfil", label: "Meu perfil", icon: UserRound },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/ajustes", label: "Ajustes", icon: Settings2 },
  { href: "/ajuda", label: "Como funciona", icon: CircleHelp },
];

/** Botão com o nome de quem está logado; abre um menu com Meu perfil e Ajustes. */
export function UserMenu({
  name,
  household,
  avatarUrl,
  compact = false,
}: {
  name: string;
  /** Nome da família, mostrado embaixo do nome da pessoa. */
  household?: string;
  avatarUrl?: string | null;
  compact?: boolean;
}) {
  const menuId = useId();
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const [lastPath, setLastPath] = useState(pathname);

  // Fecha ao navegar para outra página.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const show = () => {
    const b = buttonRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.max(b.width, 220);
    const left = Math.min(Math.max(8, b.left), window.innerWidth - width - 8);
    const up = window.innerHeight - b.bottom < 160;
    setPos(up ? { left, width, bottom: window.innerHeight - b.top + 6 } : { left, width, top: b.bottom + 6 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onClose = () => setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`user-btn ${compact ? "compact" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={compact ? `Conta de ${name}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
      >
        <Avatar name={name} color="#1AC4DB" size={compact ? 30 : 34} src={avatarUrl} />
        {!compact && (
          <span className="user-btn-text">
            <span className="user-btn-name">{name}</span>
            {household && <span className="user-btn-sub">{household}</span>}
          </span>
        )}
        {!compact && <ChevronUp size={16} strokeWidth={1.8} className="user-btn-chevron" aria-hidden />}
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} id={menuId} role="menu" aria-label={`Conta de ${name}`} className="bf-select-pop bf-select-list user-menu" style={pos} onKeyDown={onMenuKey}>
            {ITEMS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} role="menuitem" className="bf-select-option user-menu-item" onClick={() => setOpen(false)}>
                <Icon size={17} strokeWidth={1.7} />
                <span className="bf-select-option-label">{label}</span>
              </Link>
            ))}
            <div className="user-menu-sep" role="separator" />
            <form action={logout}>
              <button type="submit" role="menuitem" className="bf-select-option user-menu-item danger">
                <LogOut size={17} strokeWidth={1.7} />
                <span className="bf-select-option-label">Sair</span>
              </button>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
