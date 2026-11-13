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
  return PALETTES.some((x) => x.id === p) ? (p as Palette) : "aconchego";
};
/**
 * Troca o visual com uma animação: o tema novo se abre em círculo a partir do botão tocado
 * (View Transitions). Sem suporte, ou se a pessoa pediu menos movimento, troca com uma fusão de cores.
 */
function animated(apply: () => void, from?: HTMLElement | null) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  const r = root();
  if (vt && !reduced) {
    const box = from?.getBoundingClientRect();
    r.style.setProperty("--vt-x", `${box ? box.left + box.width / 2 : window.innerWidth / 2}px`);
    r.style.setProperty("--vt-y", `${box ? box.top + box.height / 2 : window.innerHeight / 2}px`);
    r.classList.add("vt-reveal");
    const t = vt.call(document, apply) as { finished?: Promise<unknown> } | undefined;
    const done = () => r.classList.remove("vt-reveal");
    if (t?.finished) t.finished.then(done, done);
    else window.setTimeout(done, 900);
  } else if (!reduced) {
    r.classList.add("theme-switching");
    apply();
    window.setTimeout(() => r.classList.remove("theme-switching"), 450);
  } else apply();
}

const readWide = (): Wide => {
  const w = root().getAttribute("data-wide");
  return w === "1" || w === "2" ? w : "0";
};

/** Ajustes → Aparência: cores, claro ou escuro e a largura de todas as páginas. Fica guardado neste aparelho. */
export function AppearancePanel() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const palette = useSyncExternalStore(subscribe, readPalette, () => "aconchego" as Palette);
  const wide = useSyncExternalStore(subscribe, readWide, () => "0" as Wide);

  const pickTheme = (t: Theme, el?: HTMLElement | null) => {
    store("bf-theme", t);
    animated(() => {
      root().setAttribute("data-theme", t);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLOR[t]);
    }, el);
  };
  const pickPalette = (p: Palette, el?: HTMLElement | null) => {
    store("bf-palette", p);
    animated(() => {
      if (p === "aconchego") root().removeAttribute("data-palette");
      else root().setAttribute("data-palette", p);
    }, el);
  };
  const pickWide = (w: Wide) => {
    if (w === "0") root().removeAttribute("data-wide");
    else root().setAttribute("data-wide", w);
    store("bf-wide", w);
  };

  return (
    <div className="grid">
      <section className="card form">
        <h2>Claro ou escuro</h2>
        <div className="opt-row" role="group" aria-label="Claro ou escuro">
          <button type="button" className={`opt${theme === "light" ? " on" : ""}`} aria-pressed={theme === "light"} onClick={(e) => pickTheme("light", e.currentTarget)}>
            <Sun size={18} strokeWidth={1.7} /> Claro
          </button>
          <button type="button" className={`opt${theme === "dark" ? " on" : ""}`} aria-pressed={theme === "dark"} onClick={(e) => pickTheme("dark", e.currentTarget)}>
            <Moon size={18} strokeWidth={1.7} /> Escuro
          </button>
        </div>
      </section>

      <section className="card form">
        <h2>Tema</h2>
        <p className="faint">Cada tema muda o visual inteiro: letra, formas, cartões e menu.</p>
        <div className="opt-row" role="group" aria-label="Tema">
          {PALETTES.map((p) => (
            <button key={p.id} type="button" className={`opt${palette === p.id ? " on" : ""}`} aria-pressed={palette === p.id} onClick={(e) => pickPalette(p.id, e.currentTarget)}>
              <span className="opt-dot" style={{ background: p.color }} />
              <span>
                <strong>{p.name}</strong>
                <span className="faint"> {p.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Só no computador: no celular a página já ocupa a tela toda e a opção não muda nada. */}
      <section className="card form wide-panel">
        <h2>Largura das páginas</h2>
        <p className="faint">Vale para todas as abas do menu, no computador.</p>
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
