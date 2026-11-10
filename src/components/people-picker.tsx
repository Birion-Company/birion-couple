"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { Avatar } from "./ui";

export type PickPerson = { id: string; name: string; color: string; avatarUrl?: string | null; hasLogin?: boolean };

/** "joão" acha "João": compara sem acento e sem maiúsculas. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Escolher pessoas sem quebrar o layout: fechado, mostra só quem foi escolhido; aberto, uma lista com
 * pesquisa por nome (membros da família primeiro, depois os contatos). Serve para uma pessoa
 * ("Quem pagou") ou várias ("Quem deveria pagar").
 */
export function PeoplePicker({
  people,
  value,
  onChange,
  multiple = false,
  ariaLabel,
  placeholder = "Escolha",
  me,
  disabled,
}: {
  people: PickPerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  ariaLabel: string;
  placeholder?: string;
  /** Quem está usando: aparece como "Você". */
  me?: string | null;
  disabled?: boolean;
}) {
  const autoId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});

  const nameOf = (p: PickPerson) => (p.id === me ? `${p.name} (você)` : p.name);
  const q = fold(query.trim());
  const list = q ? people.filter((p) => fold(p.name).includes(q)) : people;
  const firstContact = list.findIndex((p) => !p.hasLogin);
  const chosen = value.map((id) => people.find((p) => p.id === id)).filter((p): p is PickPerson => !!p);

  const place = useCallback(() => {
    const b = buttonRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.min(Math.max(b.width, 260), window.innerWidth - 16);
    const below = window.innerHeight - b.bottom - 12;
    const above = b.top - 12;
    const up = below < 260 && above > below;
    const maxHeight = Math.min(380, Math.max(below, above));
    const left = Math.min(Math.max(8, b.left), window.innerWidth - width - 8);
    setPos(up ? { left, width, maxHeight, bottom: window.innerHeight - b.top + 6 } : { left, width, maxHeight, top: b.bottom + 6 });
  }, []);

  const openPanel = () => {
    if (disabled) return;
    place();
    setQuery("");
    setActive(Math.max(0, people.findIndex((p) => p.id === value[0])));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const pick = (p: PickPerson | undefined) => {
    if (!p) return;
    if (!multiple) {
      onChange([p.id]);
      close();
      return;
    }
    // Mantém a ordem da lista (membros primeiro), não a ordem dos cliques.
    const next = value.includes(p.id) ? value.filter((x) => x !== p.id) : people.map((x) => x.id).filter((x) => x === p.id || value.includes(x));
    onChange(next);
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !panelRef.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      const b = buttonRef.current?.getBoundingClientRect();
      if (!b || b.bottom < 0 || b.top > window.innerHeight) close(false);
      else place();
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    const box = el?.parentElement;
    if (!el || !box) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight;
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(list[active]);
      if (multiple) setQuery("");
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") close(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`bf-select bf-select-field people-pick ${chosen.length ? "" : "empty"}`}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close(false) : openPanel())}
        onKeyDown={(e) => {
          if (!open && ["ArrowDown", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            openPanel();
          }
        }}
      >
        {chosen.length === 0 ? (
          <span className="bf-select-value placeholder">{placeholder}</span>
        ) : (
          <span className="people-pick-chosen">
            {chosen.slice(0, multiple ? 3 : 1).map((p) => (
              <span key={p.id} className="people-pick-chip">
                <Avatar name={p.name} color={p.color} size={20} src={p.avatarUrl ?? null} />
                {p.id === me ? "Você" : p.name}
              </span>
            ))}
            {chosen.length > 3 && multiple && <span className="people-pick-more">+{chosen.length - 3}</span>}
          </span>
        )}
        <ChevronDown size={16} strokeWidth={1.8} className="bf-select-chevron" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div ref={panelRef} className="people-panel" role="dialog" aria-label={ariaLabel} style={pos}>
            <label className="people-search">
              <Search size={15} strokeWidth={1.8} aria-hidden />
              <input
                ref={searchRef}
                value={query}
                placeholder="Pesquisar nome"
                aria-label="Pesquisar nome"
                aria-controls={`${autoId}-list`}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
              />
            </label>
            <ul id={`${autoId}-list`} role="listbox" aria-multiselectable={multiple || undefined} className="people-list">
              {list.length === 0 && <li className="people-empty">Ninguém com esse nome. Para cadastrar, use “Pessoas” no fim do formulário.</li>}
              {list.map((p, i) => {
                const on = value.includes(p.id);
                return (
                  <li key={p.id} className="people-li" data-index={i}>
                    {i === 0 && p.hasLogin && !q && <span className="people-group">Família</span>}
                    {i === firstContact && !q && <span className="people-group">Contatos</span>}
                    <div
                      role="option"
                      aria-selected={on}
                      className={`people-option ${i === active ? "active" : ""} ${on ? "on" : ""}`}
                      onPointerMove={() => setActive(i)}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => pick(p)}
                    >
                      {multiple && <span className={`people-box ${on ? "on" : ""}`} aria-hidden>{on && <Check size={13} strokeWidth={3} />}</span>}
                      <Avatar name={p.name} color={p.color} size={24} src={p.avatarUrl ?? null} />
                      <span className="grow">{nameOf(p)}</span>
                      {!multiple && on && <Check size={16} strokeWidth={2} aria-hidden />}
                    </div>
                  </li>
                );
              })}
            </ul>
            {multiple && (
              <div className="people-foot">
                <span className="faint">{value.length === 0 ? "Ninguém escolhido" : value.length === 1 ? "1 pessoa" : `${value.length} pessoas`}</span>
                <button type="button" className="btn small primary" onClick={() => close()}>
                  Pronto
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
