"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCheck, ChevronRight } from "lucide-react";
import { acceptApprovals } from "@/app/actions/approvals";
import { ApprovalButtons } from "./approval";
import { toastResult } from "./toaster";
import { Avatar } from "./ui";

export type InboxCard = {
  id: string;
  series: boolean;
  creator: { name: string; color: string; avatarUrl: string | null };
  description: string;
  total: string;
  /** "Você deve R$ 45,00 para Fulano". */
  role: string;
  /** Informações principais: tipo, data, como foi pago, categoria, divisão, parcelas. */
  facts: { label: string; value: string }[];
};

/**
 * "Esperando você": cada card já mostra o essencial do lançamento (tocar abre o lançamento inteiro).
 * Dá para marcar vários e aceitar de uma vez.
 */
export function ApprovalInbox({ items }: { items: InboxCard[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  // Muitos para confirmar: 20 por vez.
  const [limit, setLimit] = useState(20);
  const allOn = picked.size === items.length && items.length > 0;
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const acceptPicked = () =>
    start(async () => {
      const r = await acceptApprovals([...picked]);
      toastResult(r);
      if (r.ok) {
        setPicked(new Set());
        router.refresh();
        window.dispatchEvent(new Event("bf:tx-changed"));
      }
    });
  return (
    <>
      {items.length > 1 && (
        <div className="inbox-bar">
          <label className="inbox-all">
            <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(items.map((i) => i.id)))} />
            Selecionar todos
          </label>
          <button type="button" className="btn primary small" disabled={pending || picked.size === 0} onClick={acceptPicked}>
            <CheckCheck size={15} strokeWidth={2.2} /> {pending ? "Aceitando…" : `Aceitar ${picked.size || ""} selecionado${picked.size === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
      <div className="inbox-cards">
        {items.slice(0, limit).map((it) => (
          <article key={it.id} className={`inbox-card ${picked.has(it.id) ? "on" : ""}`}>
            <div className="inbox-top">
              {items.length > 1 && (
                <input type="checkbox" className="inbox-check" checked={picked.has(it.id)} onChange={() => toggle(it.id)} aria-label={`Selecionar ${it.description}`} />
              )}
              <Link href={`/transacoes/${it.id}`} className="inbox-open" aria-label={`Ver ${it.description}`}>
                <Avatar name={it.creator.name} color={it.creator.color} size={34} src={it.creator.avatarUrl} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <p className="inbox-who">
                    <strong>{it.creator.name}</strong> lançou
                  </p>
                  <p className="inbox-title">
                    {it.description} <span className="num">· {it.total}</span>
                  </p>
                </div>
                <ChevronRight size={18} strokeWidth={1.8} className="faint" aria-hidden />
              </Link>
            </div>
            <p className="approval-say inbox-role">{it.role}</p>
            <dl className="inbox-facts">
              {it.facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
            <ApprovalButtons txId={it.id} series={it.series} />
          </article>
        ))}
      </div>
      {items.length > limit && (
        <button type="button" className="awaiting-more" onClick={() => setLimit((n) => n + 20)}>
          Ver mais {Math.min(20, items.length - limit)} de {items.length - limit}
        </button>
      )}
    </>
  );
}
