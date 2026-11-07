"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { BellRing, CalendarClock, CreditCard } from "lucide-react";
import { shortDate, type CardAlert } from "@/lib/cards";
import { formatMoney } from "@/lib/money";

const KEY = "bf-card-alerts";
const EVENT = "bf-card-alerts-change";

/** { chaveDoEvento: "sempre" | data em que foi adiado } */
type Dismissed = Record<string, string>;

function read(raw: string | null): Dismissed {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function snapshot() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function when(a: CardAlert) {
  const d = a.daysLeft === 0 ? "hoje" : a.daysLeft === 1 ? "amanhã" : `em ${a.daysLeft} dias`;
  return `${a.type === "closing" ? "fecha" : "vence"} ${d} (${shortDate(a.date)})`;
}

/** Popup que avisa quando a fatura de algum cartão está perto de fechar ou vencer. */
export function CardAlerts({ alerts, currency }: { alerts: CardAlert[]; currency: string }) {
  // No servidor (e antes de ler o navegador) não mostra nada, para não piscar.
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const firstBtn = useRef<HTMLButtonElement>(null);
  const today = localToday();
  const dismissed = read(raw);
  const visible = raw === null ? [] : alerts.filter((a) => {
    const v = dismissed[a.key];
    return !v || (v !== "sempre" && v !== today);
  });
  const open = visible.length > 0;

  const save = (mode: "today" | "forever") => {
    const next: Dismissed = {};
    // Guarda só eventos que ainda não passaram.
    for (const [k, v] of Object.entries(dismissed)) if ((k.split(":")[2] ?? "") >= today) next[k] = v;
    for (const a of visible) next[a.key] = mode === "forever" ? "sempre" : today;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* sem armazenamento: o aviso volta na próxima visita */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  useEffect(() => {
    if (!open) return;
    firstBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") save("today");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;
  const anyDue = visible.some((a) => a.type === "due");

  return (
    <div className="alert-backdrop" onClick={(e) => e.target === e.currentTarget && save("today")}>
      <div className="alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="card-alert-title" aria-describedby="card-alert-list">
        <span className="alert-icon" aria-hidden>
          <BellRing size={22} strokeWidth={1.8} />
        </span>
        <h2 id="card-alert-title">{anyDue ? "Fatura perto de vencer" : "Fatura perto de fechar"}</h2>
        <ul id="card-alert-list" className="alert-list">
          {visible.map((a) => (
            <li key={a.key}>
              <span className="card-chip small" style={{ background: a.color }} aria-hidden>
                {a.type === "due" ? <CalendarClock size={14} strokeWidth={1.9} /> : <CreditCard size={14} strokeWidth={1.9} />}
              </span>
              <div>
                <p className="title">
                  {a.cardName}: fatura {when(a)}
                </p>
                <p className="sub num">
                  {formatMoney(a.amountCents, currency)} {a.type === "due" ? "a pagar" : "até agora"}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="alert-actions">
          <button ref={firstBtn} type="button" className="btn primary" onClick={() => save("today")}>
            Entendi, lembrar amanhã
          </button>
          <Link href="/cartoes" className="btn" onClick={() => save("today")}>
            Ver cartões
          </Link>
          <button type="button" className="btn ghost" onClick={() => save("forever")}>
            Não lembrar mais desta fatura
          </button>
        </div>
      </div>
    </div>
  );
}
