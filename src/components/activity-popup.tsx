"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { History } from "lucide-react";
import { markActivitySeen } from "@/app/actions/transactions";
import { Avatar } from "./ui";

export type ActivityFeedItem = { id: string; actor: string; text: string; detail: string | null; when: string; href: string | null };

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/** Popup com o que outras pessoas criaram, alteraram ou excluíram envolvendo quem está logado. */
export function ActivityPopup({ items }: { items: ActivityFeedItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const btn = useRef<HTMLButtonElement>(null);

  const done = () =>
    start(async () => {
      await markActivitySeen();
      router.refresh();
    });

  useEffect(() => {
    btn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="alert-backdrop">
      <div className="alert-dialog activity-dialog" role="alertdialog" aria-modal="true" aria-labelledby="activity-title" aria-describedby="activity-list">
        <span className="alert-icon" aria-hidden>
          <History size={22} strokeWidth={1.8} />
        </span>
        <h2 id="activity-title">O que mudou desde a sua última visita</h2>
        <ul id="activity-list" className="alert-list activity-list">
          {items.map((a) => (
            <li key={a.id}>
              <Avatar name={a.actor} color="#1AC4DB" size={30} />
              <div style={{ minWidth: 0 }}>
                <p className="title">{a.text}</p>
                {a.detail && <p className="sub">{a.detail}</p>}
                <p className="sub faint">
                  {ago(a.when)}
                  {a.href && (
                    <>
                      {" · "}
                      <Link href={a.href} className="pos" onClick={done}>
                        ver lançamento
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="alert-actions">
          <button ref={btn} type="button" className="btn primary" onClick={done} disabled={pending}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
