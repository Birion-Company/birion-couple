"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Barrinha no topo que começa a andar no instante em que a pessoa toca num link do app e some quando
 * a tela nova chega. No site, cada tela vem do servidor (pode levar um pouco): assim o toque responde
 * na hora, sem parecer travado.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<{ on: boolean; from: string }>({ on: false, from: "" });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || /^(https?:|mailto:|tel:)/.test(href) || href.startsWith("/api/")) return;
      const url = new URL(href, window.location.href);
      // Mesma tela (só muda filtro/mês): também carrega do servidor, então mostra a barrinha.
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      setState({ on: true, from: window.location.pathname + window.location.search });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Chegou na tela nova (ou trocou a consulta): esconde. Segurança: some sozinha depois de 15 s.
  useEffect(() => {
    if (!state.on) return;
    const check = () => {
      if (window.location.pathname + window.location.search !== state.from) setState({ on: false, from: "" });
    };
    const id = setInterval(check, 100);
    const giveUp = setTimeout(() => setState({ on: false, from: "" }), 15000);
    return () => {
      clearInterval(id);
      clearTimeout(giveUp);
    };
  }, [state, pathname]);

  // O conteúdo antigo esmaece enquanto a tela nova não chega.
  useEffect(() => {
    const r = document.documentElement;
    if (state.on) r.setAttribute("data-navigating", "");
    else r.removeAttribute("data-navigating");
    return () => r.removeAttribute("data-navigating");
  }, [state.on]);

  return <div className={`nav-progress ${state.on ? "on" : ""}`} aria-hidden />;
}
