"use client";

import { useEffect } from "react";

const BASE_W = 1440;
const BASE_H = 810;
const MARGIN = 64;

/**
 * Faz o bloco de entrada se comportar como um elemento só:
 * - ao abrir a página (e ao redimensionar a janela) ele é encaixado na tela;
 * - no zoom do navegador (+ / −) a escala fica parada em pixels CSS, então o bloco
 *   inteiro cresce ou diminui junto com o zoom, com tudo dentro na mesma proporção.
 * O zoom é percebido pela mudança do devicePixelRatio, que só muda com o zoom
 * (ou ao arrastar a janela para outro monitor).
 */
export function AuthScaler() {
  useEffect(() => {
    const scene = document.querySelector<HTMLElement>(".auth-scene");
    if (!scene) return;
    const fit = () => Math.min((window.innerWidth - MARGIN) / BASE_W, (window.innerHeight - MARGIN) / BASE_H);
    let scale = fit();
    let dpr = window.devicePixelRatio;
    let width = window.innerWidth * dpr;
    let height = window.innerHeight * dpr;
    const apply = () => scene.style.setProperty("--auth-scale", String(Math.max(0.2, scale)));
    apply();

    const onResize = () => {
      const nextDpr = window.devicePixelRatio;
      // Tamanho da janela em pixels do aparelho: não muda com o zoom, só quando a janela muda.
      const nextW = window.innerWidth * nextDpr;
      const nextH = window.innerHeight * nextDpr;
      const windowChanged = Math.abs(nextW - width) > 2 || Math.abs(nextH - height) > 2;
      if (nextDpr === dpr || windowChanged) scale = fit();
      dpr = nextDpr;
      width = nextW;
      height = nextH;
      apply();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      scene.style.removeProperty("--auth-scale");
    };
  }, []);
  return null;
}
