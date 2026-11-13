"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Plus, Search, Trash2, X } from "lucide-react";
import { bulkEdit } from "@/app/actions/batch";
import { deleteListItem, saveListItem } from "@/app/actions/settings";
import { LIMITS, PALETTE } from "@/lib/defaults";
import { formatMoney } from "@/lib/money";
import { toastResult } from "./toaster";

/** Criar projeto: só o nome (a cor vem sozinha). */
export function NewProject({ count }: { count: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="project-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        start(async () => {
          const r = await saveListItem("projects", null, { name, color: PALETTE[count % PALETTE.length], description: null });
          toastResult(r.ok ? { ok: true, message: `Projeto “${name.trim()}” criado. Agora coloque lançamentos nele.` } : r);
          if (r.ok) {
            setName("");
            router.refresh();
          }
        });
      }}
    >
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do projeto (ex.: Viagem para a praia)" maxLength={60} aria-label="Nome do projeto" />
      <button className="btn primary" disabled={pending || !name.trim() || count >= LIMITS.projects}>
        <Plus size={16} /> Criar projeto
      </button>
      <span className="faint">{count} de {LIMITS.projects}</span>
    </form>
  );
}

type Cand = { id: string; date: string; description: string; amountCents: number; category: string; series: string };
const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Colocar lançamentos": pesquisa, marca e coloca no projeto de uma vez. */
export function AddToProject({ projectId, name, candidates, currency }: { projectId: string; name: string; candidates: Cand[]; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const q = fold(query.trim());
  const shown = (q ? candidates.filter((c) => fold(c.description).includes(q) || fold(c.category).includes(q)) : candidates).slice(0, 80);
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const total = candidates.filter((c) => picked.has(c.id)).reduce((a, c) => a + c.amountCents, 0);
  const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  if (!open) {
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Colocar lançamentos
      </button>
    );
  }
  return (
    <section className="card section project-add">
      <div className="card-head">
        <h2>Colocar em “{name}”</h2>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
      <label className="list-search">
        <Search size={15} strokeWidth={1.8} aria-hidden />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar lançamento" aria-label="Pesquisar lançamento" />
      </label>
      <p className="faint" style={{ margin: "6px 0" }}>Despesas sem projeto dos últimos 6 meses. Marque as que são deste projeto.</p>
      <div className="project-pick">
        {shown.length === 0 && <p className="faint">Nada encontrado.</p>}
        {shown.map((c) => (
          <label key={c.id} className={`project-pick-row ${picked.has(c.id) ? "on" : ""}`}>
            <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="grow">
              <span className="title">
                {c.description}
                {c.series && <span className="tx-series">{c.series}</span>}
              </span>
              <span className="sub" style={{ display: "block" }}>
                {day(c.date)} · {c.category}
              </span>
            </span>
            <span className="num">{formatMoney(c.amountCents, currency)}</span>
          </label>
        ))}
      </div>
      <div className="actions" style={{ justifyContent: "space-between", marginTop: 10 }}>
        <span className="faint">{picked.size ? `${picked.size} marcados · ${formatMoney(total, currency)}` : "Nada marcado"}</span>
        <button
          className="btn primary"
          disabled={pending || picked.size === 0}
          onClick={() =>
            start(async () => {
              const r = await bulkEdit([...picked], { projectId });
              toastResult(r);
              if (r.ok) {
                setPicked(new Set());
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          <Check size={16} /> Colocar no projeto
        </button>
      </div>
    </section>
  );
}

/** Tira um lançamento do projeto (o lançamento continua existindo). */
export function RemoveFromProject({ txId }: { txId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="icon-btn"
      disabled={pending}
      title="Tirar do projeto"
      aria-label="Tirar do projeto"
      onClick={() =>
        start(async () => {
          const r = await bulkEdit([txId], { projectId: null });
          toastResult(r.ok ? { ok: true, message: "Tirado do projeto (o lançamento continua)." } : r);
          if (r.ok) router.refresh();
        })
      }
    >
      <X size={16} />
    </button>
  );
}

/** Excluir o projeto (os lançamentos continuam, só saem do projeto). */
export function DeleteProject({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn ghost danger small"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Excluir o projeto “${name}”? Os lançamentos continuam, só saem do projeto.`)) return;
        start(async () => {
          const r = await deleteListItem("projects", id);
          toastResult(r);
          if (r.ok) router.push("/projetos");
        });
      }}
    >
      <Trash2 size={15} /> Excluir projeto
    </button>
  );
}
