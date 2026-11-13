"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";

/** Valor que "sobe" de zero até o número final quando a tela abre (sem animação se a pessoa pediu menos movimento). */
export function CountMoney({ cents, currency = "BRL", duration = 1100 }: { cents: number; currency?: string; duration?: number }) {
  const [shown, setShown] = useState(cents);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) {
      setShown(cents);  
      return;
    }
    first.current = false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(cents * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0); // eslint-disable-line react-hooks/set-state-in-effect
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents, duration]);
  return <span className="num">{formatMoney(shown, currency)}</span>;
}
