"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { squareJpeg } from "./profile-forms";
import { Archive, ArchiveRestore, Camera, EyeOff, Eye, GripVertical, ListOrdered, Pencil, Plus, Search, Send, Trash2 } from "lucide-react";
import { deleteListItem, inviteContact, reorderCategories, saveListItem, setArchived, setPersonPhoto, sortCategoriesByUse } from "@/app/actions/settings";
import { CATEGORY_ICONS, suggestIcon } from "@/lib/category-icons";
import { CONTACTS_ACTIVE_MAX, PALETTE, STATUS_BEHAVIORS } from "@/lib/defaults";
import { toastResult } from "./toaster";
import { Avatar, CategoryIcon, Dot } from "./ui";

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
  icon?: string;
  /** Foto (de quem tem login vem do perfil; de quem não tem, pode ser trocada aqui). */
  avatarUrl?: string | null;
  hasLogin?: boolean;
};

/** Círculo da pessoa: sem login, tocar troca a foto; com login, a foto é a do perfil dela. */
function PersonPhoto({ item }: { item: ListItem }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  if (item.hasLogin) {
    return (
      <span title={`Foto do perfil de ${item.name}`}>
        <Avatar name={item.name} color={item.color} src={item.avatarUrl} />
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className="person-photo-btn"
        disabled={pending}
        onClick={() => input.current?.click()}
        aria-label={item.avatarUrl ? `Trocar a foto de ${item.name}` : `Adicionar foto de ${item.name}`}
        title={item.avatarUrl ? "Trocar a foto" : "Adicionar foto"}
      >
        <Avatar name={item.name} color={item.color} src={item.avatarUrl} />
        <span className="person-photo-cam" aria-hidden>
          <Camera size={11} strokeWidth={2.2} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          start(async () => {
            try {
              toastResult(await setPersonPhoto(item.id, await squareJpeg(f)));
            } catch {
              toastResult({ ok: false, error: "Não deu para ler essa imagem." });
            }
          });
        }}
      />
    </>
  );
}

const WORDS: Record<Kind, { one: string; add: string; empty: string }> = {
  participants: { one: "contato", add: "Adicionar contato", empty: "Nenhum contato ainda. Eles também são criados ao lançar, em Adicionar pessoa." },
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
  // Categoria: ícone escolhido; enquanto não escolher, sugere pelo nome.
  const [icon, setIcon] = useState<string | null>(item?.icon ?? null);
  const shownIcon = icon ?? suggestIcon(name);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = { name, color };
    if (kind === "projects") data.description = description;
    if (kind === "categories") data.icon = shownIcon;
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
      {kind === "categories" && (
        <div className="field">
          <span className="label-text" id="icon-label">Ícone</span>
          <div className="icon-grid" role="radiogroup" aria-labelledby="icon-label">
            {CATEGORY_ICONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={shownIcon === key}
                aria-label={label}
                title={label}
                className={`icon-choice ${shownIcon === key ? "on" : ""}`}
                style={shownIcon === key ? { color, borderColor: color } : undefined}
                onClick={() => setIcon(key)}
              >
                <Icon size={18} strokeWidth={1.8} />
              </button>
            ))}
          </div>
          {!icon && <span className="faint">Sugerido pelo nome. Toque em outro para trocar.</span>}
        </div>
      )}
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

/** `canInvite`: contatos podem ser convidados para o app (só quem administra). */
export function ListEditor({ kind, items, canInvite = false }: { kind: Kind; items: ListItem[]; canInvite?: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const w = WORDS[kind];
  // Categorias: a ordem daqui é a das listas de escolha. Muda na hora e salva em seguida.
  const [ordered, setOrdered] = useOptimistic(items);
  const sortable = kind === "categories";
  // Arrastando: a ordem muda na tela enquanto você puxa; ao soltar, é salva.
  const [drag, setDrag] = useState<{ id: string; order: string[]; moved: boolean } | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const byId = new Map(ordered.map((x) => [x.id, x]));
  const shown = drag ? drag.order.map((id) => byId.get(id)!).filter(Boolean) : ordered;
  // Pesquisa (contatos): acha pelo nome, inclusive os escondidos.
  const fold = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = fold(query.trim());
  const visible = shown.filter((i) => (q ? fold(i.name).includes(q) : showArchived || !i.archived));
  const save = (list: ListItem[]) =>
    start(async () => {
      setOrdered(list);
      const r = await reorderCategories(list.map((x) => x.id));
      if (!r.ok) toastResult(r);
    });
  const onDragMove = (clientY: number) => {
    if (!drag || !rowsRef.current) return;
    // Onde o dedo/mouse está: depois de todas as linhas cujo meio ficou acima dele.
    const rows = [...rowsRef.current.querySelectorAll<HTMLElement>("[data-sort-id]")].filter((el) => el.dataset.sortId !== drag.id);
    const index = rows.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 < clientY;
    }).length;
    const others = visible.map((x) => x.id).filter((id) => id !== drag.id);
    const next = [...others.slice(0, index), drag.id, ...others.slice(index)];
    const hidden = drag.order.filter((id) => !next.includes(id));
    const order = [...next, ...hidden];
    if (order.join() !== drag.order.join()) setDrag({ ...drag, order, moved: true });
  };
  const onDragEnd = () => {
    if (drag?.moved) save(drag.order.map((id) => byId.get(id)!).filter(Boolean));
    setDrag(null);
  };
  const move = (id: string, delta: number) => {
    const list = [...ordered];
    const from = list.findIndex((x) => x.id === id);
    // Pula as arquivadas escondidas: a seta leva para a próxima que aparece.
    let to = from;
    do to += delta;
    while (to >= 0 && to < list.length && !showArchived && list[to].archived);
    if (to < 0 || to >= list.length) return;
    const [it] = list.splice(from, 1);
    list.splice(to, 0, it);
    save(list);
  };
  const archivedCount = items.filter((i) => i.archived).length;
  // Contatos (pessoas sem login): no máximo CONTACTS_ACTIVE_MAX ativos (nas listas).
  const activeCount = items.length - archivedCount;
  const full = kind === "participants" && activeCount >= CONTACTS_ACTIVE_MAX;
  const people = kind === "participants";
  // "Convidar para o app": cria o convite ligado ao contato e copia o link.
  const invite = (id: string, name: string) =>
    start(async () => {
      const r = await inviteContact(id);
      if (!r.ok || !r.code) return toastResult(r);
      const link = `${window.location.origin}/convite/${r.code}`;
      try {
        await navigator.clipboard.writeText(link);
        toastResult({ ok: true, message: `Link de convite de ${name} copiado. Vale por 7 dias.` });
      } catch {
        window.prompt(`Envie este link para ${name}:`, link);
      }
    });
  const behaviorLabel = (b?: string) => STATUS_BEHAVIORS.find((x) => x.value === b)?.label;

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => toastResult(await fn()));

  // Contatos: cadastrar e pesquisar ficam em cima (não precisa rolar a lista toda para adicionar).
  const topBar = people && (
    <div className="list-top">
      {editing === "new" ? (
        <ItemForm kind={kind} item={null} onDone={() => setEditing(null)} defaultColor={PALETTE[items.length % PALETTE.length]} />
      ) : (
        <div className="list-top-row">
          <button className="btn primary" onClick={() => setEditing("new")} disabled={full}>
            <Plus size={16} /> {w.add}
          </button>
          <label className="list-search">
            <Search size={15} strokeWidth={1.8} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar contato" aria-label="Pesquisar contato" />
          </label>
        </div>
      )}
      <p className={`faint list-count ${full ? "neg" : ""}`}>
        {activeCount} de {CONTACTS_ACTIVE_MAX} contatos ativos{full ? " · esconda um para adicionar outro" : ""}
        {archivedCount > 0 ? ` · ${archivedCount} escondido${archivedCount === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );

  return (
    <div className="card" data-tour={`list-${kind}`}>
      {topBar}
      {sortable && visible.length > 1 && (
        <div className="order-head">
          <p className="faint">Arraste pela alça ⋮⋮ para mudar a ordem.</p>
          <button className="btn small" disabled={pending} onClick={() => act(() => sortCategoriesByUse())}>
            <ListOrdered size={15} strokeWidth={1.8} /> Mais usadas primeiro
          </button>
        </div>
      )}
      {visible.length === 0 && editing !== "new" && <div className="empty">{q ? `Ninguém com “${query}”.` : w.empty}</div>}
      <div className="rows" ref={rowsRef}>
        {visible.map((item) =>
          editing === item.id ? (
            <ItemForm key={item.id} kind={kind} item={item} onDone={() => setEditing(null)} />
          ) : (
            <div
              key={item.id}
              className={`row ${sortable ? "sortable-row" : ""} ${drag?.id === item.id ? "dragging" : ""}`}
              data-sort-id={sortable ? item.id : undefined}
              style={{ opacity: item.archived ? 0.55 : 1 }}
            >
              {sortable && (
                <button
                  type="button"
                  className="drag-handle"
                  aria-label={`Mover ${item.name}: arraste, ou use as setas para cima e para baixo`}
                  title="Arraste para mudar a ordem"
                  disabled={pending && !drag}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDrag({ id: item.id, order: ordered.map((x) => x.id), moved: false });
                  }}
                  onPointerMove={(e) => onDragMove(e.clientY)}
                  onPointerUp={onDragEnd}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      move(item.id, e.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
                >
                  <GripVertical size={18} strokeWidth={1.8} />
                </button>
              )}
              {kind === "participants" ? (
                <PersonPhoto item={item} />
              ) : kind === "categories" ? (
                <CategoryIcon icon={item.icon} color={item.color} />
              ) : (
                <Dot color={item.color} />
              )}
              <div className="grow">
                <p className="title">{item.name}</p>
                {(item.description || kind === "statuses" || item.archived) && (
                  <p className="sub">
                    {[
                      item.description,
                      kind === "statuses" && item.behavior ? `significa: ${behaviorLabel(item.behavior)}` : null,
                      item.isDefault ? "padrão nos lançamentos" : null,
                      item.isImportDefault ? "padrão nas importações" : null,
                      item.archived ? (kind === "participants" ? "escondido · volta ao digitar o nome num lançamento" : "arquivado") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              {people && canInvite && !item.archived && (
                <button className="icon-btn" disabled={pending} onClick={() => invite(item.id, item.name)} aria-label={`Convidar ${item.name} para o app`} title="Convidar para o app">
                  <Send size={16} strokeWidth={1.6} />
                </button>
              )}
              <button className="icon-btn" onClick={() => setEditing(item.id)} aria-label={`Editar ${item.name}`} title="Editar">
                <Pencil size={16} strokeWidth={1.6} />
              </button>
              <button
                className="icon-btn"
                disabled={pending || (item.archived && full)}
                onClick={() => act(() => setArchived(kind, item.id, !item.archived))}
                aria-label={people ? `${item.archived ? "Mostrar" : "Esconder"} ${item.name}` : item.archived ? `Reativar ${item.name}` : `Arquivar ${item.name}`}
                title={people ? (item.archived ? "Mostrar nas listas" : "Esconder das listas") : item.archived ? "Reativar" : "Arquivar"}
              >
                {people ? (
                  item.archived ? <Eye size={16} strokeWidth={1.6} /> : <EyeOff size={16} strokeWidth={1.6} />
                ) : item.archived ? (
                  <ArchiveRestore size={16} strokeWidth={1.6} />
                ) : (
                  <Archive size={16} strokeWidth={1.6} />
                )}
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
      {people ? (
        archivedCount > 0 && !q && (
          <div className="actions" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn ghost small" onClick={() => setShowArchived((x) => !x)}>
              {showArchived ? "Ocultar escondidos" : `Ver escondidos (${archivedCount})`}
            </button>
          </div>
        )
      ) : editing === "new" ? (
        <ItemForm kind={kind} item={null} onDone={() => setEditing(null)} defaultColor={PALETTE[items.length % PALETTE.length]} />
      ) : (
        <div className="actions" style={{ marginTop: 12, justifyContent: "space-between" }}>
          <div className="actions" style={{ alignItems: "center" }}>
            <button className="btn" onClick={() => setEditing("new")}>
              <Plus size={16} /> {w.add}
            </button>
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
