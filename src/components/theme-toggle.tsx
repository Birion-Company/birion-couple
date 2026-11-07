"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
const KEY = "bf-theme";

/**
 * Roda no <head> antes da primeira pintura: aplica o tema salvo (ou o do sistema),
 * assim a tela não pisca ao carregar.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

function current(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function ThemeToggle({ className = "icon-btn", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => setTheme(current()), []);

  const toggle = () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    setTheme(next);
  };

  const label = theme === "dark" ? "Usar tema claro" : "Usar tema escuro";
  return (
    <button type="button" className={className} onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <Sun size={18} strokeWidth={1.7} /> : <Moon size={18} strokeWidth={1.7} />}
      {withLabel && <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>}
    </button>
  );
}
