"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, History, Mail, Send, X } from "lucide-react";
import { decideInviteRequest, requestInvite } from "@/app/actions/settings";
import type { InviteRequestRow } from "@/lib/family-log";
import { loadFamilyLog, loadFeed, type FeedRow } from "@/app/actions/history";
import { PagedList } from "./paged-list";
import { toast, toastResult } from "./toaster";

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

async function copyInvite(code: string) {
  const link = `${window.location.origin}/convite/${code}`;
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copiado. Envie para a pessoa.");
  } catch {
    window.prompt("Copie o link do convite:", link);
  }
}

/** Quem administra: pedidos de convite esperando resposta, um por linha, com Aceitar e Recusar. */
export function InviteRequestsAdmin({ requests }: { requests: InviteRequestRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const open = requests.filter((r) => r.status === "pending");
  if (open.length === 0) return null;
  const decide = (id: string, ok: boolean) =>
    start(async () => {
      const r = await decideInviteRequest(id, ok, reason);
      toastResult(r);
      if (r.ok) {
        setRefusing(null);
        setReason("");
        router.refresh();
      }
    });
  return (
    <section className="card section requests" aria-labelledby="pedidos">
      <div className="card-head">
        <h2 id="pedidos">
          <Mail size={17} strokeWidth={1.9} aria-hidden /> Pedidos de convite
        </h2>
        <span className="count-pill">{open.length}</span>
      </div>
      <p className="faint">Alguém da família quer chamar uma pessoa. Aceitando, o link aparece para quem pediu mandar.</p>
      <div className="rows">
        {open.map((r) => (
          <div key={r.id} className="row request-row">
            <div className="grow">
              <p className="title">
                <strong>{r.requester}</strong> quer convidar <strong>{r.forName}</strong>
              </p>
              <p className="sub">Pedido em {when(r.createdAt)}</p>
              {refusing === r.id && (
                <div className="request-refuse">
                  <input
                    className="input"
                    placeholder="Motivo (opcional)"
                    maxLength={200}
                    value={reason}
                    autoFocus
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button type="button" className="btn danger small" disabled={pending} onClick={() => decide(r.id, false)}>
                    Recusar
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setRefusing(null)}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
            {refusing !== r.id && (
              <div className="request-actions">
                <button type="button" className="btn primary small" disabled={pending} onClick={() => decide(r.id, true)}>
                  <Check size={14} strokeWidth={2.4} /> Aceitar
                </button>
                <button type="button" className="btn small" disabled={pending} onClick={() => setRefusing(r.id)}>
                  <X size={14} strokeWidth={2.2} /> Recusar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Membro: pedir um convite e acompanhar os pedidos (com o link quando for aceito). */
export function RequestInvitePanel({ requests }: { requests: InviteRequestRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const status = (r: InviteRequestRow) =>
    r.status === "pending"
      ? "esperando quem administra"
      : r.status === "declined"
        ? `recusado${r.reason ? `: “${r.reason}”` : ""}`
        : r.used
          ? "aceito · a pessoa já entrou"
          : r.code
            ? "aceito · copie o link e envie"
            : "aceito · o link venceu, peça de novo";
  return (
    <section className="card section" aria-labelledby="pedir-convite">
      <h2 id="pedir-convite" style={{ marginBottom: 4 }}>
        Chamar alguém para a família
      </h2>
      <p className="faint" style={{ marginBottom: 10 }}>
        Quem administra recebe o pedido. Quando aceitar, o link aparece aqui para você mandar.
      </p>
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await requestInvite(name);
            toastResult(r);
            if (r.ok) {
              setName("");
              router.refresh();
            }
          });
        }}
      >
        <input className="input grow" placeholder="Para quem? Ex.: Júlio, meu irmão" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={pending || !name.trim()}>
          <Send size={15} /> Pedir convite
        </button>
      </form>
      {requests.length > 0 && (
        <div className="rows" style={{ marginTop: 10 }}>
          {requests.map((r) => (
            <div key={r.id} className="row">
              <div className="grow">
                <p className="title">{r.forName}</p>
                <p className={`sub ${r.status === "declined" ? "neg" : ""}`}>
                  {status(r)} · {when(r.createdAt)}
                </p>
              </div>
              {r.code && (
                <button type="button" className="btn small" onClick={() => copyInvite(r.code!)}>
                  <Copy size={14} /> Copiar link
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type LogRow = { id: string; when: string; text: string };

/**
 * Histórico (não é notificação): o registro do que aconteceu. Quem administra vê a família toda;
 * membro vê o que fez e o que foi com ele. Em páginas do servidor: busca e "Ver mais" sem limite de quantidade.
 */
export function HistoryPanel({
  isAdmin,
  family,
  feed,
  requests,
}: {
  isAdmin: boolean;
  family: { rows: LogRow[]; next: string | null };
  feed: { rows: FeedRow[]; next: string | null };
  requests: InviteRequestRow[];
}) {
  type Tab = "familia" | "lancamentos" | "pedidos";
  const [tab, setTab] = useState<Tab>("familia");
  const tabs: { id: Tab; label: string }[] = [
    { id: "familia", label: "Família" },
    { id: "lancamentos", label: "Lançamentos" },
    ...(isAdmin ? [{ id: "pedidos" as Tab, label: "Pedidos de convite" }] : []),
  ];
  return (
    <section className="card section history" aria-labelledby="historico">
      <h2 id="historico">
        <History size={17} strokeWidth={1.9} aria-hidden /> {isAdmin ? "Histórico da família" : "Seu histórico"}
      </h2>
      <p className="faint">
        {isAdmin
          ? "Tudo que aconteceu na família, de todo mundo. Não é notificação: fica guardado aqui."
          : "O que você fez e o que foi feito com você. Não é notificação: fica guardado aqui."}
      </p>
      <div className="history-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "familia" && (
        <PagedList
          key="familia"
          className="history-list"
          initial={family}
          load={loadFamilyLog}
          placeholder="Buscar no histórico da família"
          empty="Nada por aqui ainda."
          render={(r) => (
            <div className="history-item">
              <time dateTime={r.when}>{when(r.when)}</time>
              <span className="history-text">{r.text}</span>
            </div>
          )}
        />
      )}
      {tab === "lancamentos" && (
        <PagedList
          key="lancamentos"
          className="history-list"
          initial={feed}
          load={loadFeed}
          placeholder="Buscar (pessoa, lançamento, valor…)"
          empty="Nada por aqui ainda."
          render={(x) => (
            <div className="history-item">
              <time dateTime={x.when}>{when(x.when)}</time>
              {x.href ? (
                <Link href={x.href} className="history-text">
                  {x.text}
                  {x.detail ? <span className="faint"> · {x.detail}</span> : null}
                </Link>
              ) : (
                <span className="history-text">
                  {x.text}
                  {x.detail ? <span className="faint"> · {x.detail}</span> : null}
                </span>
              )}
            </div>
          )}
        />
      )}
      {tab === "pedidos" && (
        <div className="history-list">
          {requests.length === 0 && <p className="faint">Nada por aqui ainda.</p>}
          {requests.map((r) => (
            <div key={r.id} className="history-item">
              <time dateTime={r.createdAt}>{when(r.createdAt)}</time>
              <span className="history-text">
                <strong>{r.requester}</strong> pediu convite para <strong>{r.forName}</strong> ·{" "}
                <span className={r.status === "declined" ? "neg" : r.status === "pending" ? "warn" : "pos"}>
                  {r.status === "pending" ? "esperando" : r.status === "declined" ? "recusado" : r.used ? "aceito, já entrou" : "aceito"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
