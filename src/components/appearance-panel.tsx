"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { BAR_COLOR, PALETTES, type Palette, type Theme } from "./theme-toggle";

type Wide = "0" | "1" | "2";
const WIDTHS: { id: Wide; name: string; help: string }[] = [
  { id: "0", name: "Normal", help: "Centralizado" },
  { id: "1", name: "Larga", help: "Mais para os lados" },
  { id: "2", name: "Total", help: "Usa a tela toda" },
];

function root() {
  return document.documentElement;
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
function subscribe(onChange: () => void) {
  const o = new MutationObserver(onChange);
  o.observe(root(), { attributes: true, attributeFilter: ["data-theme", "data-palette", "data-wide"] });
  return () => o.disconnect();
}
const readTheme = (): Theme => (root().getAttribute("data-theme") === "light" ? "light" : "dark");
const readPalette = (): Palette => {
  const p = root().getAttribute("data-palette");
  return p === "jardim" || p === "oceano" || p === "sobrio" ? p : "aconchego";
};
const readWide = (): Wide => {
  const w = root().getAttribute("data-wide");
  return w === "1" || w === "2" ? w : "0";
};

/** Ajustes → Aparência: cores, claro ou escuro e a largura de todas as páginas. Fica guardado neste aparelho. */
export function AppearancePanel() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const palette = useSyncExternalStore(subscribe, readPalette, () => "aconchego" as Palette);
  const wide = useSyncExternalStore(subscribe, readWide, () => "0" as Wide);

  const pickTheme = (t: Theme) => {
    root().setAttribute("data-theme", t);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLOR[t]);
    store("bf-theme", t);
  };
  const pickPalette = (p: Palette) => {
    if (p === "aconchego") root().removeAttribute("data-palette");
    else root().setAttribute("data-palette", p);
    store("bf-palette", p);
  };
  const pickWide = (w: Wide) => {
    if (w === "0") root().removeAttribute("data-wide");
    else root().setAttribute("data-wide", w);
    store("bf-wide", w);
  };

  return (
    <div className="grid">
      <section className="card form">
        <h2>Tema</h2>
        <div className="opt-row" role="group" aria-label="Tema">
          <button type="button" className={`opt${theme === "light" ? " on" : ""}`} aria-pressed={theme === "light"} onClick={() => pickTheme("light")}>
            <Sun size={18} strokeWidth={1.7} /> Claro
          </button>
          <button type="button" className={`opt${theme === "dark" ? " on" : ""}`} aria-pressed={theme === "dark"} onClick={() => pickTheme("dark")}>
            <Moon size={18} strokeWidth={1.7} /> Escuro
          </button>
        </div>
      </section>

      <section className="card form">
        <h2>Cores</h2>
        <div className="opt-row" role="group" aria-label="Cores">
          {PALETTES.map((p) => (
            <button key={p.id} type="button" className={`opt${palette === p.id ? " on" : ""}`} aria-pressed={palette === p.id} onClick={() => pickPalette(p.id)}>
              <span className="opt-dot" style={{ background: p.color }} /> {p.name}
            </button>
          ))}
        </div>
      </section>

      <section className="card form">
        <h2>Largura das páginas</h2>
        <p className="faint">Vale para todas as abas do menu.</p>
        <div className="opt-row" role="group" aria-label="Largura das páginas">
          {WIDTHS.map((w) => (
            <button key={w.id} type="button" className={`opt wide-opt${wide === w.id ? " on" : ""}`} aria-pressed={wide === w.id} onClick={() => pickWide(w.id)}>
              <span className={`wide-ico w${w.id}`} aria-hidden>
                <i />
              </span>
              <span>
                <strong>{w.name}</strong>
                <span className="faint"> {w.help}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
