"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/** Botão "voltar para cima": aparece só depois de descer a tela e sobe com uma animação. */
export function BackToTop() {
  const [show, setShow] = useState(false);
  const [rising, setRising] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const up = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    setRising(true);
    window.setTimeout(() => setRising(false), 700);
  };
  return (
    <button type="button" className={`to-top${show ? " on" : ""}${rising ? " rising" : ""}`} onClick={up} aria-label="Voltar para cima" tabIndex={show ? 0 : -1} aria-hidden={!show}>
      <ArrowUp size={20} strokeWidth={2.2} />
    </button>
  );
}
