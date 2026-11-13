"use client";

import { PushSettingsDialog } from "./push-settings";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Bell, BellRing, CalendarClock, CreditCard, Settings, X } from "lucide-react";
import { markActivitySeen } from "@/app/actions/transactions";
import { shortDate, type CardAlert } from "@/lib/cards";
import { formatMoney } from "@/lib/money";
import { Avatar } from "./ui";

export type NotificationItem = { id: string; actor: string; text: string; detail: string | null; when: string; href: string | null; unread: boolean };

/** De quanto em quanto tempo procurar novidades (aba aberta / aba em segundo plano). */
const POLL_MS = 15_000; // leve: só a data da última novidade, a lista vem quando algo muda
const POLL_HIDDEN_MS = 120_000;
const SEEN_CARDS = "bf-notif-cards";
const BROWSER_OPT = "bf-notif-browser";
const OPEN_EVENT = "bf-open-notifs";

// ---------- Contador compartilhado entre os botões do sino ----------

let unreadCount = 0;
const listeners = new Set<() => void>();
function setUnread(n: number) {
  if (n === unreadCount) return;
  unreadCount = n;
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Botão do sino; abre o painel da central (que fica montada uma vez só no layout). */
export function BellButton({ className = "icon-btn" }: { className?: string }) {
  const n = useSyncExternalStore(subscribe, () => unreadCount, () => 0);
  return (
    <button
      type="button"
      className={`${className} bell-btn`}
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label={n > 0 ? `Notificações: ${n} ${n === 1 ? "nova" : "novas"}` : "Notificações"}
      title="Notificações"
      data-tour="bell"
    >
      <Bell size={18} strokeWidth={1.7} />
      {n > 0 && <span className="bell-count" aria-hidden>{n > 99 ? "99+" : n}</span>}
    </button>
  );
}

// ---------- Utilidades ----------

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function cardText(a: CardAlert) {
  if (a.type === "due" && a.daysLeft < 0) {
    const late = -a.daysLeft;
    return `${a.cardName}: fatura venceu ${shortDate(a.date)} e não foi paga (${late} ${late === 1 ? "dia" : "dias"} de atraso)`;
  }
  const d = a.daysLeft === 0 ? "hoje" : a.daysLeft === 1 ? "amanhã" : `em ${a.daysLeft} dias`;
  return `${a.cardName}: fatura ${a.type === "closing" ? "fecha" : "vence"} ${d} (${shortDate(a.date)})`;
}

function readSeenCards(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_CARDS) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function browserOptIn() {
  try {
    return localStorage.getItem(BROWSER_OPT) === "1" && "Notification" in window && Notification.permission === "granted";
  } catch {
    return false;
  }
}

// ---------- Central ----------

type Toast = { key: string; title: string; detail: string | null; href: string | null };

/**
 * Central de notificações: guarda a lista, procura novidades a cada poucos segundos,
 * mostra um aviso no canto quando chega algo novo e abre o painel pelo sino.
 */
export function NotificationCenter({ initial, cardAlerts, currency }: { initial: NotificationItem[]; cardAlerts: CardAlert[]; currency: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  // Configurar notificações abre por cima do painel, na engrenagem.
  const [settings, setSettings] = useState(false);
  const [seenCards, setSeenCards] = useState<string[] | null>(null);
  const known = useRef(new Set(initial.map((i) => i.id)));
  const panel = useRef<HTMLDivElement>(null);

  // Lê o que já foi visto (só existe no navegador) e avisa das novidades da última visita.
  useEffect(() => {
    const seen = readSeenCards();
    const unread = initial.filter((i) => i.unread);
    const newCards = cardAlerts.filter((a) => !seen.includes(a.key));
    const t = setTimeout(() => {
      setSeenCards(seen);
      if (unread.length > 0) {
        setToast({
          key: "visita",
          title: unread.length === 1 ? unread[0].text : `${unread.length} novidades desde a sua última visita`,
          detail: unread.length === 1 ? unread[0].detail : unread.slice(0, 2).map((i) => i.text).join(" · "),
          href: null,
        });
      } else if (newCards.length > 0) {
        setToast({ key: "fatura", title: cardText(newCards[0]), detail: newCards.length > 1 ? `e mais ${newCards.length - 1} aviso de fatura` : null, href: "/cartoes" });
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCards = seenCards === null ? [] : cardAlerts.filter((a) => !seenCards.includes(a.key));
  const unread = items.filter((i) => i.unread).length + unreadCards.length;
  useEffect(() => setUnread(unread), [unread]);

  // Procura novidades. Manda a data da última novidade que já tem: se nada mudou, a resposta é mínima.
  const lastStamp = useRef<string | null>(null);
  const q0 = useRef(true);
  const poll = useCallback(async () => {
    let data: { changed: boolean; last: string; items?: NotificationItem[] } | null = null;
    try {
      const q = lastStamp.current !== null ? `?desde=${encodeURIComponent(lastStamp.current)}` : "";
      const r = await fetch(`/api/notificacoes${q}`, { cache: "no-store" });
      if (!r.ok) return;
      data = await r.json();
    } catch {
      return;
    }
    if (!data) return;
    lastStamp.current = data.last;
    if (!data.changed || !data.items) return;
    // Primeira consulta: só aprende a data (a lista inicial veio com a página).
    if (q0.current) {
      q0.current = false;
      data.items.forEach((i) => known.current.add(i.id));
      setItems(data.items);
      return;
    }
    const list = data.items;
    const fresh = list.filter((i) => i.unread && !known.current.has(i.id));
    list.forEach((i) => known.current.add(i.id));
    setItems(list);
    if (fresh.length === 0) return;
    const first = fresh[0];
    setToast({
      key: first.id,
      title: fresh.length === 1 ? first.text : `${fresh.length} novidades`,
      detail: fresh.length === 1 ? first.detail : fresh.slice(0, 2).map((i) => i.text).join(" · "),
      href: fresh.length === 1 ? first.href : null,
    });
    if (document.hidden && browserOptIn()) {
      try {
        const n = new Notification("Birion Finance", { body: fresh.length === 1 ? first.text : `${fresh.length} novidades: ${first.text}`, tag: "bf-" + first.id, icon: "/brand/mark.png" });
        n.onclick = () => {
          window.focus();
          window.dispatchEvent(new Event(OPEN_EVENT));
        };
      } catch {
        /* navegador sem suporte a notificação fora de service worker */
      }
    }
    // Os números da tela mudaram: atualiza sem recarregar.
    router.refresh();
  }, [router]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(async () => {
        await poll();
        loop();
      }, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
    };
    loop();
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // Aviso do canto some sozinho.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  const markAllSeen = useCallback(() => {
    if (items.some((i) => i.unread)) {
      setItems((xs) => xs.map((x) => ({ ...x, unread: false })));
      void markActivitySeen();
    }
    if (cardAlerts.length > 0) {
      const keys = cardAlerts.map((a) => a.key);
      setSeenCards(keys);
      try {
        localStorage.setItem(SEEN_CARDS, JSON.stringify(keys));
      } catch {
        /* sem armazenamento: o aviso volta a contar na próxima visita */
      }
    }
  }, [items, cardAlerts]);

  const close = useCallback(() => {
    setOpen(false);
    markAllSeen();
  }, [markAllSeen]);

  useEffect(() => {
    const onOpen = () => {
      setToast(null);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open || settings) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, settings]);

  const isNewCard = (a: CardAlert) => unreadCards.some((u) => u.key === a.key);

  return (
    <>
      {toast &&
        !open &&
        createPortal(
          <div className="live-toast" role="status" aria-live="polite">
            <span className="live-toast-icon" aria-hidden>
              <BellRing size={18} strokeWidth={1.8} />
            </span>
            <button type="button" className="live-toast-body" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
              <span className="title">{toast.title}</span>
              {toast.detail && <span className="sub">{toast.detail}</span>}
              <span className="live-toast-cta">Ver notificações</span>
            </button>
            <button type="button" className="icon-btn live-toast-x" onClick={() => setToast(null)} aria-label="Fechar aviso">
              <X size={15} />
            </button>
          </div>,
          document.body,
        )}

      {open &&
        createPortal(
          <div className="notif-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
            <div ref={panel} tabIndex={-1} className="notif-panel" role="dialog" aria-modal="true" aria-labelledby="notif-title">
              <div className="notif-head">
                <h2 id="notif-title">Notificações</h2>
                <span className="notif-head-actions">
                  <button type="button" className="icon-btn" onClick={() => setSettings(true)} aria-label="Configurar notificações" title="Configurar notificações">
                    <Settings size={18} />
                  </button>
                  <button type="button" className="icon-btn" onClick={close} aria-label="Fechar notificações">
                    <X size={18} />
                  </button>
                </span>
              </div>

              <div className="notif-scroll">
                {cardAlerts.length > 0 && (
                  <section aria-labelledby="notif-cards">
                    <h3 id="notif-cards" className="notif-section">Faturas</h3>
                    <ul className="notif-list">
                      {cardAlerts.map((a) => (
                        <li key={a.key} className={isNewCard(a) ? "unread" : undefined}>
                          <span className="card-chip small" style={{ background: a.color }} aria-hidden>
                            {a.type === "due" ? <CalendarClock size={14} strokeWidth={1.9} /> : <CreditCard size={14} strokeWidth={1.9} />}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <p className="title">{cardText(a)}</p>
                            <p className="sub num">
                              {formatMoney(a.amountCents, currency)} {a.type === "due" ? (a.daysLeft < 0 ? "em atraso" : "a pagar") : "até agora"}
                              {a.mineCents !== undefined && a.mineCents !== a.amountCents && <> · sua parte {formatMoney(a.mineCents, currency)}</>}
                            </p>
                            <p className="sub">
                              <Link href="/cartoes" className="pos" onClick={close}>
                                ver cartões
                              </Link>
                            </p>
                          </div>
                          {isNewCard(a) && <span className="notif-dot" aria-label="nova" />}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section aria-labelledby="notif-activity">
                  <h3 id="notif-activity" className="notif-section">De nós dois</h3>
                  {items.length === 0 ? (
                    <p className="notif-empty">Nada por aqui ainda.</p>
                  ) : (
                    <ul className="notif-list">
                      {items.map((a) => (
                        <li key={a.id} className={a.unread ? "unread" : undefined}>
                          <Avatar name={a.actor} color="#E07A5F" size={30} />
                          <div style={{ minWidth: 0 }}>
                            <p className="title">{a.text}</p>
                            {a.detail && <p className="sub">{a.detail}</p>}
                            <p className="sub faint">
                              {ago(a.when)}
                              {a.href && (
                                <>
                                  {" · "}
                                  <Link href={a.href} className="pos" onClick={close}>
                                    ver lançamento
                                  </Link>
                                </>
                              )}
                            </p>
                          </div>
                          {a.unread && <span className="notif-dot" aria-label="nova" />}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

            </div>
          </div>,
          document.body,
        )}
      {settings && <PushSettingsDialog onClose={() => setSettings(false)} />}
    </>
  );
}
