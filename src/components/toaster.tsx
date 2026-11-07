"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; text: string; kind: "ok" | "error" };

/** Mostra um aviso curto. Pode ser chamado de qualquer componente do cliente. */
export function toast(text: string, kind: "ok" | "error" = "ok") {
  window.dispatchEvent(new CustomEvent("bf-toast", { detail: { text, kind } }));
}

/** Atalho para o retorno padrão das ações do servidor. */
export function toastResult(r: { ok: boolean; error?: string; message?: string }) {
  if (!r.ok) toast(r.error ?? "Algo deu errado.", "error");
  else if (r.message) toast(r.message);
}

export function Toaster() {
  const [current, setCurrent] = useState<Toast | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const { text, kind } = (e as CustomEvent).detail;
      setCurrent({ id: Date.now(), text, kind });
      clearTimeout(timer);
      timer = setTimeout(() => setCurrent(null), kind === "error" ? 5000 : 2800);
    };
    window.addEventListener("bf-toast", on);
    return () => {
      window.removeEventListener("bf-toast", on);
      clearTimeout(timer);
    };
  }, []);
  if (!current) return null;
  return (
    <div key={current.id} role="status" aria-live="polite" className={`toast ${current.kind === "error" ? "error" : ""}`}>
      {current.text}
    </div>
  );
}
