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
export const BAR_COLOR: Record<Theme, string> = { light: "#fbf6f0", dark: "#1c1613" };

export const PALETTES = [
  { id: "aconchego", blurb: "Macio e acolhedor, com letra serifada", name: "Aconchego", color: "#e07a5f" },
  { id: "jardim", blurb: "Orgânico, redondo, com textura", name: "Jardim", color: "#6f9c7c" },
  { id: "lavanda", blurb: "Vidro e degradê", name: "Lavanda", color: "#8b7cf6" },
  { id: "rose", blurb: "Editorial, fino e elegante", name: "Rosé", color: "#e0728f" },
  { id: "oceano", blurb: "Painel técnico e denso", name: "Oceano", color: "#1ac4db" },
  { id: "sobrio", blurb: "Mínimo, reto, sem enfeite", name: "Sóbrio", color: "#5b6573" },
] as const;
export type Palette = (typeof PALETTES)[number]["id"];
const PALETTE_KEY = "bf-palette";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t!=="light"&&t!=="dark"){t="dark"}var r=document.documentElement;r.setAttribute("data-theme",t);var p=localStorage.getItem("${PALETTE_KEY}");if(p==="jardim"||p==="lavanda"||p==="rose"||p==="oceano"||p==="sobrio"){r.setAttribute("data-palette",p)}var w=localStorage.getItem("bf-wide");if(w==="1"||w==="2"){r.setAttribute("data-wide",w)}var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"#fbf6f0":"#1c1613")}catch(e){}})()`;

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

function currentPalette(): Palette {
  if (typeof document === "undefined") return "aconchego";
  const p = document.documentElement.getAttribute("data-palette");
  return PALETTES.some((x) => x.id === p) ? (p as Palette) : "aconchego";
}

function subscribePalette(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-palette"] });
  return () => observer.disconnect();
}

/** Bolinhas para escolher a paleta de cores (cada pessoa guarda a sua neste aparelho). */
export function PaletteToggle({ className = "palette-pick" }: { className?: string }) {
  const palette = useSyncExternalStore<Palette>(subscribePalette, currentPalette, () => "aconchego");
  const pick = (id: Palette) => {
    const root = document.documentElement;
    if (id === "aconchego") root.removeAttribute("data-palette");
    else root.setAttribute("data-palette", id);
    try {
      localStorage.setItem(PALETTE_KEY, id);
    } catch {}
  };
  return (
    <div className={className} role="group" aria-label="Cores do app">
      {PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          className={palette === p.id ? "palette-dot on" : "palette-dot"}
          style={{ background: p.color }}
          onClick={() => pick(p.id)}
          aria-label={p.name}
          aria-pressed={palette === p.id}
          title={p.name}
        />
      ))}
    </div>
  );
}
