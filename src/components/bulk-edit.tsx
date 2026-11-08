"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { bulkEdit, type BulkPatch } from "@/app/actions/batch";
import type { Lookups } from "@/lib/queries";
import { Select } from "./select";
import { toastResult } from "./toaster";
import { Avatar } from "./ui";

const KEEP = "__manter";

/**
 * Painel "Editar em lote": cada campo começa em "Não mudar"; só o que for alterado é aplicado
 * aos lançamentos selecionados.
 */
export function BulkEditDialog({ ids, lookups, onClose, onDone }: { ids: string[]; lookups: Lookups; onClose: () => void; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(KEEP);
  const [category, setCategory] = useState(KEEP);
  const [project, setProject] = useState(KEEP);
  const [payer, setPayer] = useState(KEEP);
  const [card, setCard] = useState(KEEP);
  const [changeSplit, setChangeSplit] = useState(false);
  const people = lookups.participants.filter((p) => !p.archived);
  const [split, setSplit] = useState<string[]>(people.map((p) => p.id));
  const [changeDate, setChangeDate] = useState(false);
  const [date, setDate] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const name = (id: string | null) => lookups.participants.find((p) => p.id === id)?.name;

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch: BulkPatch = {};
  if (status !== KEEP) patch.statusId = status;
  if (category !== KEEP) patch.categoryId = category || null;
  if (project !== KEEP) patch.projectId = project || null;
  if (payer !== KEEP) patch.payerId = payer || null;
  if (card !== KEEP) patch.cardId = card || null;
  if (changeSplit) patch.splitIds = split;
  if (changeDate && date) patch.date = date;
  const changes = Object.keys(patch).length;

  const apply = () =>
    start(async () => {
      const r = await bulkEdit(ids, patch);
      toastResult(r);
      if (r.ok) onDone();
    });

  const keep = { value: KEEP, label: "Não mudar" };
  return createPortal(
    <div className="alert-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} tabIndex={-1} className="alert-dialog bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
        <div className="bulk-head">
          <h2 id="bulk-title">Editar {ids.length} {ids.length === 1 ? "lançamento" : "lançamentos"}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <p className="faint" style={{ marginBottom: 12 }}>Só muda o que você alterar aqui; o resto de cada lançamento fica como está.</p>
        <div className="form">
          <div className="field-row">
            <label className="field">
              <span>Status</span>
              <Select value={status} onChange={setStatus} options={[keep, ...lookups.statuses.filter((s) => !s.archived).map((s) => ({ value: s.id, label: s.name, color: s.color }))]} />
            </label>
            <label className="field">
              <span>Categoria</span>
              <Select
                value={category}
                onChange={setCategory}
                options={[keep, { value: "", label: "Sem categoria" }, ...lookups.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, color: c.color }))]}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Quem pagou</span>
              <Select value={payer} onChange={setPayer} options={[keep, { value: "", label: "Ninguém ainda" }, ...people.map((p) => ({ value: p.id, label: p.name, color: p.color }))]} />
            </label>
            {lookups.cards.some((c) => !c.archived) && (
              <label className="field">
                <span>Cartão</span>
                <Select
                  value={card}
                  onChange={setCard}
                  options={[
                    keep,
                    { value: "", label: "Não foi no cartão" },
                    ...lookups.cards.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.ownerId ? `${c.name} · ${name(c.ownerId)}` : c.name, color: c.color })),
                  ]}
                />
              </label>
            )}
          </div>
          {lookups.projects.some((p) => !p.archived) && (
            <label className="field">
              <span>Projeto</span>
              <Select value={project} onChange={setProject} options={[keep, { value: "", label: "Nenhum" }, ...lookups.projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name, color: p.color }))]} />
            </label>
          )}
          <div className="field">
            <label className="check">
              <input type="checkbox" checked={changeSplit} onChange={(e) => setChangeSplit(e.target.checked)} />
              <span>Mudar a divisão (partes iguais entre:)</span>
            </label>
            {changeSplit && (
              <div className="person-pills" style={{ margin: 0, flexWrap: "wrap" }}>
                {people.map((p) => {
                  const on = split.includes(p.id);
                  return (
                    <button key={p.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setSplit((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}>
                      <Avatar name={p.name} color={p.color} size={22} /> {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="field">
            <label className="check">
              <input type="checkbox" checked={changeDate} onChange={(e) => setChangeDate(e.target.checked)} />
              <span>Mudar a data</span>
            </label>
            {changeDate && <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Nova data" />}
          </div>
          <p className="faint">
            Empréstimos e acertos não mudam de quem pagou, divisão nem cartão (edite um por um). O cartão precisa ser de quem pagou; se quem pagou mudar, um cartão de outra pessoa sai.
          </p>
        </div>
        <div className="bulk-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={apply} disabled={pending || changes === 0 || (changeSplit && split.length === 0) || (changeDate && !date)}>
            {pending ? "Aplicando…" : changes === 0 ? "Escolha o que mudar" : `Aplicar em ${ids.length}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
