"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
const KEY = "bf-theme";

/**
 * Roda no <head> antes da primeira pintura: aplica o tema salvo (ou o do sistema),
 * assim a tela não pisca ao carregar.
 */
/** Cor da barra do celular (status bar / barra do navegador) em cada tema: a mesma do fundo do app. */
export const BAR_COLOR: Record<Theme, string> = { light: "#eef6f8", dark: "#030a14" };

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t!=="light"&&t!=="dark"){t="dark"}document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"${"#eef6f8"}":"${"#030a14"}")}catch(e){}})()`;

/** Troca a cor da barra do celular junto com o tema. */
function paintBar(theme: Theme) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLOR[theme]);
}

function current(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Acompanha o atributo data-theme do <html>, que pode mudar por qualquer botão da página. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function ThemeToggle({ className = "icon-btn", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "dark");

  const toggle = () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    const root = document.documentElement;
    const apply = () => {
      root.setAttribute("data-theme", next);
      paintBar(next);
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (vt && !reduced) {
      // Fusão suave feita pelo navegador (uma "foto" da tela antiga some enquanto a nova aparece), sem animar
      // elemento por elemento: não engasga em páginas grandes.
      vt.call(document, apply);
    } else if (reduced) {
      apply();
    } else {
      // Navegador sem essa função: transição de cor nos elementos (mais pesada), só durante a troca.
      root.classList.add("theme-switching");
      apply();
      window.setTimeout(() => root.classList.remove("theme-switching"), 350);
    }
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  };

  const label = theme === "dark" ? "Usar tema claro" : "Usar tema escuro";
  return (
    <button type="button" className={className} onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <Sun size={18} strokeWidth={1.7} /> : <Moon size={18} strokeWidth={1.7} />}
      {withLabel && <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>}
    </button>
  );
}
