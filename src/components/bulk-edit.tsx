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
 * Painel "Editar em lote": quem pagou, quem deveria pagar e o resto da configuração.
 * Tudo começa em "Não mudar"; só o que for alterado é aplicado aos lançamentos selecionados.
 */
export function BulkEditDialog({ ids, lookups, onClose, onDone }: { ids: string[]; lookups: Lookups; onClose: () => void; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [kind, setKind] = useState(KEEP);
  const [payer, setPayer] = useState(KEEP);
  // Quem deveria pagar: nenhuma pessoa marcada = não mudar.
  const [owers, setOwers] = useState<string[]>([]);
  const [category, setCategory] = useState(KEEP);
  const [noCategory, setNoCategory] = useState(false);
  const [project, setProject] = useState(KEEP);
  const [card, setCard] = useState(KEEP);
  const [changeDate, setChangeDate] = useState(false);
  const [date, setDate] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const people = lookups.participants.filter((p) => !p.archived);
  const name = (id: string | null) => lookups.participants.find((p) => p.id === id)?.name ?? "alguém";

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch: BulkPatch = {};
  if (kind !== KEEP) patch.kind = kind as "expense" | "income";
  if (payer !== KEEP) patch.payerId = payer || null;
  if (owers.length) patch.splitIds = owers;
  if (noCategory) patch.noCategory = true;
  else if (category !== KEEP) patch.categoryId = category || null;
  if (project !== KEEP) patch.projectId = project || null;
  if (card !== KEEP) patch.cardId = card || null;
  if (changeDate && date) patch.date = date;
  const changes = Object.keys(patch).length;

  // Resumo do efeito de quem pagou + quem deveria pagar.
  const payerText = payer === KEEP ? "quem pagou continua o mesmo" : payer ? `${name(payer)} pagou` : "ninguém pagou ainda";
  const owersOthers = owers.filter((o) => o !== payer);
  let summary: string | null = null;
  if (payer !== KEEP || owers.length) {
    const should = owers.length === 0 ? "quem deveria pagar continua o mesmo" : owers.length === 1 ? `${name(owers[0])} deveria pagar tudo` : `${owers.map(name).join(", ")} dividem igualmente`;
    let effect = "";
    if (payer === "") effect = " → não gera dívida até alguém pagar.";
    else if (payer !== KEEP && owers.length && owersOthers.length === 0) effect = ` → é só de ${name(payer)}, não gera dívida.`;
    else if (payer !== KEEP && owersOthers.length) {
      effect =
        owers.length === 1
          ? ` → ${name(owers[0])} fica devendo o valor todo para ${name(payer)}.`
          : ` → ${owersOthers.map(name).join(", ")} ${owersOthers.length === 1 ? "fica devendo a parte dela" : "ficam devendo a parte de cada um"} para ${name(payer)}.`;
    }
    summary = `Em cada lançamento: ${payerText}; ${should}${effect}`;
  }

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
        <p className="faint" style={{ marginBottom: 12 }}>Só muda o que você alterar.</p>

        <div className="form">
          <fieldset className="bulk-group">
            <legend>Quem pagou e quem deveria pagar</legend>
            <label className="field">
              <span>Quem pagou</span>
              <Select value={payer} onChange={setPayer} options={[keep, ...people.map((p) => ({ value: p.id, label: p.name, color: p.color }))]} />
            </label>
            <div className="field">
              <span className="label-text" id="bulk-owers">Quem deveria pagar</span>
              <div className="person-pills" role="group" aria-labelledby="bulk-owers" style={{ margin: 0, flexWrap: "wrap" }}>
                {people.map((p) => {
                  const on = owers.includes(p.id);
                  return (
                    <button key={p.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setOwers((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}>
                      <Avatar name={p.name} color={p.color} size={22} src={p.avatarUrl} /> {p.name}
                    </button>
                  );
                })}
              </div>
              <span className="faint">Nenhuma: não muda. Uma: conta toda dela. Várias: partes iguais.</span>
            </div>
            {summary && (
              <p className="bulk-summary" role="status">
                {summary}
              </p>
            )}
          </fieldset>

          <fieldset className="bulk-group">
            <legend>Classificação</legend>
            <div className="field-row">
              <label className="field">
                <span>Tipo</span>
                <Select value={kind} onChange={setKind} options={[keep, { value: "expense", label: "Despesa" }, { value: "income", label: "Receita" }]} />
              </label>
            </div>
            <div className="field-row">
              <div className="field">
                <span>Categoria</span>
                <Select
                  value={noCategory ? KEEP : category}
                  onChange={setCategory}
                  disabled={noCategory}
                  options={[keep, { value: "", label: "Sem categoria" }, ...lookups.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, color: c.color }))]}
                />
                <span className="check no-category">
                  <input id="bulk-no-category" type="checkbox" checked={noCategory} onChange={(e) => setNoCategory(e.target.checked)} />
                  <label htmlFor="bulk-no-category">Não precisa de categoria</label>
                </span>
              </div>
              {lookups.projects.some((p) => !p.archived) && (
                <label className="field">
                  <span>Projeto</span>
                  <Select value={project} onChange={setProject} options={[keep, { value: "", label: "Nenhum" }, ...lookups.projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name, color: p.color }))]} />
                </label>
              )}
            </div>
          </fieldset>

          <fieldset className="bulk-group">
            <legend>Cartão e data</legend>
            <div className="field-row">
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
              <div className="field">
                <label className="check" style={{ minHeight: 0 }}>
                  <input type="checkbox" checked={changeDate} onChange={(e) => setChangeDate(e.target.checked)} />
                  <span>Mudar a data</span>
                </label>
                {changeDate && <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Nova data" />}
              </div>
            </div>
          </fieldset>

          <p className="faint">
            Dívidas e acertos se editam um por um.
          </p>
        </div>
        <div className="bulk-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={apply} disabled={pending || changes === 0 || (changeDate && !date)}>
            {pending ? "Aplicando…" : changes === 0 ? "Escolha o que mudar" : `Aplicar em ${ids.length}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
