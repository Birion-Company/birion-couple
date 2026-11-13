"use client";

import { useEffect } from "react";

/** Os blocos da página (cartões, números, contas…) que aparecem com animação ao entrar na tela. */
const TARGETS = ".card, .stat, .account-card, .summary-row, .accounts-total, .st-cell, .goal-card, .help-section, .credit-card-panel, .tx-group, .month-outlook, .outlook";
/** Dentro de menus, janelas e painéis a animação é a própria de abrir; aqui não repete. */
const SKIP = ".tx-modal, .alert-dialog, .notif-panel, .push-dialog, .tour-card, .bf-select-pop, .people-panel, .people-menu-panel, .month-picker, .filters-inline, .dash-tools, .sheet, .rise";

/**
 * Ao rolar a página, cada bloco sobe e aparece quando entra na tela (um depois do outro quando vários entram juntos).
 * Depois da animação o bloco volta ao estilo normal. Quem pediu menos movimento no aparelho não vê nada.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const done = (el: HTMLElement) => {
      el.classList.remove("sr", "sr-in");
      el.style.removeProperty("--sr-d");
    };
    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.style.setProperty("--sr-d", `${Math.min(i, 6) * 70}ms`);
          i++;
          requestAnimationFrame(() => el.classList.add("sr-in"));
          window.setTimeout(() => done(el), 1100 + Math.min(i, 6) * 70);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );
    // Marca de quem já está sendo observado (por execução do efeito: no modo de desenvolvimento ele roda duas vezes).
    const seen = new WeakSet<Element>();
    const prep = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => {
        if (seen.has(el) || el.closest(SKIP) || el.querySelector(":scope > .dash-grid")) return;
        seen.add(el);
        el.classList.add("sr");
        io.observe(el);
      });
    };
    prep(document);
    const mo = new MutationObserver((muts) => {
      for (const m of muts)
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) {
            if (n.matches(TARGETS) && !seen.has(n) && !n.closest(SKIP)) {
              seen.add(n);
              n.classList.add("sr");
              io.observe(n);
            }
            prep(n);
          }
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      document.querySelectorAll<HTMLElement>(".sr").forEach(done);
    };
  }, []);
  return null;
}
