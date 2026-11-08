"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteListItem, saveListItem, setArchived } from "@/app/actions/settings";
import { FAMILY_PEOPLE_MAX, PALETTE, STATUS_BEHAVIORS } from "@/lib/defaults";
import { toastResult } from "./toaster";
import { Avatar, Dot } from "./ui";

type Kind = "participants" | "categories" | "projects" | "statuses";

export type ListItem = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  description?: string | null;
  behavior?: string;
  isDefault?: boolean;
  isImportDefault?: boolean;
};

const WORDS: Record<Kind, { one: string; add: string; empty: string }> = {
  participants: { one: "pessoa", add: "Adicionar pessoa", empty: "Nenhuma pessoa cadastrada." },
  categories: { one: "categoria", add: "Nova categoria", empty: "Nenhuma categoria." },
  projects: { one: "projeto", add: "Novo projeto", empty: "Nenhum projeto. Use projetos para separar viagens, reformas, eventos…" },
  statuses: { one: "status", add: "Novo status", empty: "Nenhum status." },
};

export function ColorPicker({ value, onChange, palette = PALETTE }: { value: string; onChange: (c: string) => void; palette?: readonly string[] }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Cor">
      {palette.map((c) => (
        <button
          key={c}
          type="button"
          className="swatch"
          style={{ background: c }}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          aria-label={`Cor ${c}`}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="swatch" style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)", position: "relative" }} title="Outra cor">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, position: "absolute", inset: 0 }} aria-label="Outra cor" />
      </label>
    </div>
  );
}

function ItemForm({ kind, item, onDone, defaultColor }: { kind: Kind; item: ListItem | null; onDone: () => void; defaultColor?: string }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(item?.name ?? "");
  const [color, setColor] = useState(item?.color ?? defaultColor ?? PALETTE[0]);
  const [description, setDescription] = useState(item?.description ?? "");
  const [behavior, setBehavior] = useState(item?.behavior ?? "pending");
  const [isDefault, setIsDefault] = useState(item?.isDefault ?? false);
  const [isImportDefault, setIsImportDefault] = useState(item?.isImportDefault ?? false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = { name, color };
    if (kind === "projects") data.description = description;
    if (kind === "statuses") Object.assign(data, { behavior, isDefault, isImportDefault });
    start(async () => {
      const r = await saveListItem(kind, item?.id ?? null, data);
      toastResult(r);
      if (r.ok) onDone();
    });
  };

  return (
    <form className="form sheet" onSubmit={submit}>
      <label className="field">
        <span>Nome</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
      </label>
      <div className="field">
        <span className="label-text">Cor</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {kind === "projects" && (
        <label className="field">
          <span>Descrição</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Opcional" />
        </label>
      )}
      {kind === "statuses" && (
        <>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label-text" style={{ marginBottom: 6 }}>O que este status significa</legend>
            {STATUS_BEHAVIORS.map((b) => (
              <label key={b.value} className="check" style={{ alignItems: "flex-start", minHeight: 0, padding: "6px 0" }}>
                <input type="radio" name="behavior" checked={behavior === b.value} onChange={() => setBehavior(b.value)} style={{ marginTop: 3 }} />
                <span>
                  {b.label}
                  <span className="faint" style={{ display: "block" }}>{b.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Usar como padrão em novos lançamentos
          </label>
          <label className="check">
            <input type="checkbox" checked={isImportDefault} onChange={(e) => setIsImportDefault(e.target.checked)} />
            Usar como padrão nas importações
          </label>
        </>
      )}
      <div className="actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onDone} disabled={pending}>Cancelar</button>
        <button className="btn primary" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
      </div>
    </form>
  );
}

export function ListEditor({ kind, items }: { kind: Kind; items: ListItem[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, start] = useTransition();
  const w = WORDS[kind];
  const visible = items.filter((i) => showArchived || !i.archived);
  const archivedCount = items.filter((i) => i.archived).length;
  // Pessoas: no máximo FAMILY_PEOPLE_MAX ativas.
  const activeCount = items.length - archivedCount;
  const full = kind === "participants" && activeCount >= FAMILY_PEOPLE_MAX;
  const behaviorLabel = (b?: string) => STATUS_BEHAVIORS.find((x) => x.value === b)?.label;

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => toastResult(await fn()));

  return (
    <div className="card">
      {visible.length === 0 && editing !== "new" && <div className="empty">{w.empty}</div>}
      <div className="rows">
        {visible.map((item) =>
          editing === item.id ? (
            <ItemForm key={item.id} kind={kind} item={item} onDone={() => setEditing(null)} />
          ) : (
            <div key={item.id} className="row" style={{ opacity: item.archived ? 0.55 : 1 }}>
              {kind === "participants" ? <Avatar name={item.name} color={item.color} /> : <Dot color={item.color} />}
              <div className="grow">
                <p className="title">{item.name}</p>
                {(item.description || kind === "statuses" || item.archived) && (
                  <p className="sub">
                    {[
                      item.description,
                      kind === "statuses" ? behaviorLabel(item.behavior) : null,
                      item.isDefault ? "padrão nos lançamentos" : null,
                      item.isImportDefault ? "padrão nas importações" : null,
                      item.archived ? "arquivado" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <button className="icon-btn" onClick={() => setEditing(item.id)} aria-label={`Editar ${item.name}`} title="Editar">
                <Pencil size={16} strokeWidth={1.6} />
              </button>
              <button
                className="icon-btn"
                disabled={pending || (item.archived && full)}
                onClick={() => act(() => setArchived(kind, item.id, !item.archived))}
                aria-label={item.archived ? `Reativar ${item.name}` : `Arquivar ${item.name}`}
                title={item.archived ? "Reativar" : "Arquivar"}
              >
                {item.archived ? <ArchiveRestore size={16} strokeWidth={1.6} /> : <Archive size={16} strokeWidth={1.6} />}
              </button>
              <button
                className="icon-btn"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Excluir ${w.one} "${item.name}"?`)) act(() => deleteListItem(kind, item.id));
                }}
                aria-label={`Excluir ${item.name}`}
                title="Excluir"
              >
                <Trash2 size={16} strokeWidth={1.6} />
              </button>
            </div>
          ),
        )}
      </div>
      {editing === "new" ? (
        <ItemForm kind={kind} item={null} onDone={() => setEditing(null)} defaultColor={PALETTE[items.length % PALETTE.length]} />
      ) : (
        <div className="actions" style={{ marginTop: 12, justifyContent: "space-between" }}>
          <div className="actions" style={{ alignItems: "center" }}>
            <button className="btn" onClick={() => setEditing("new")} disabled={full} aria-describedby={kind === "participants" ? "limite-pessoas" : undefined}>
              <Plus size={16} /> {w.add}
            </button>
            {kind === "participants" && (
              <span id="limite-pessoas" className={`faint ${full ? "neg" : ""}`}>
                {activeCount} de {FAMILY_PEOPLE_MAX} pessoas{full ? " · arquive alguém para adicionar outra" : ""}
              </span>
            )}
          </div>
          {archivedCount > 0 && (
            <button className="btn ghost small" onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? "Esconder arquivados" : `Ver arquivados (${archivedCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
