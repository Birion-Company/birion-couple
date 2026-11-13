"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export type SelectOption = { value: string; label: string; color?: string; disabled?: boolean };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Texto mostrado quando nenhuma opção corresponde ao valor (ex.: "Categoria"). */
  placeholder?: string;
  /** Texto fixo do botão, no lugar da opção escolhida (ex.: nome do filtro quando vazio). */
  buttonLabel?: string;
  ariaLabel?: string;
  /** field = campo de formulário, chip = filtro arredondado, bulk = barra escura de ações. */
  variant?: "field" | "chip" | "bulk";
  /** Para filtros: mostra o chip como ativo quando há valor. */
  active?: boolean;
  disabled?: boolean;
  /** Valor enviado em formulários comuns. */
  name?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  icon?: ReactNode;
  /** Campo de pesquisa no topo da lista. Padrão: liga sozinho com mais de 8 opções (pessoas, categorias…). */
  searchable?: boolean;
};

/** "joão" acha "João": compara sem acento e sem maiúsculas. */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** A partir de quantas opções a lista ganha pesquisa. */
const SEARCH_FROM = 9;

/**
 * Menu de seleção no tema Birion. Substitui o <select> nativo, cuja lista é desenhada
 * pelo sistema e não segue o tema. Segue o padrão ARIA "select-only combobox".
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  buttonLabel,
  ariaLabel,
  variant = "field",
  active,
  disabled,
  name,
  id,
  className = "",
  style,
  icon,
  searchable,
}: Props) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const withSearch = searchable ?? options.length >= SEARCH_FROM;
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  // Opções que aparecem (todas, ou só as que batem com a pesquisa), pelos índices originais.
  const shownIdx = options.map((_, i) => i).filter((i) => !q || fold(options[i].label).includes(q));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pos, setPos] = useState<CSSProperties>({});
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const place = useCallback(() => {
    const b = buttonRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.max(b.width, 240);
    const below = window.innerHeight - b.bottom - 12;
    const above = b.top - 12;
    const maxHeight = Math.min(withSearch ? 380 : 320, Math.max(below, above));
    const up = below < 200 && above > below;
    const left = Math.min(Math.max(8, b.left), window.innerWidth - width - 8);
    setPos(
      up
        ? { left, width, maxHeight, bottom: window.innerHeight - b.top + 6 }
        : { left, width, maxHeight, top: b.bottom + 6 },
    );
  }, [withSearch]);

  const openMenu = (index = selectedIndex) => {
    if (disabled) return;
    place();
    setQuery("");
    setActiveIndex(index >= 0 ? index : options.findIndex((o) => !o.disabled));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    close();
    if (o.value !== value) onChange(o.value);
  };

  // Fecha ao tocar fora. Rolar a página ou mudar o tamanho da tela só reposiciona a lista:
  // no iPhone a barra do Safari aparece e some ao rolar, e isso fechava o menu logo depois do toque.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !popRef.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      const b = buttonRef.current?.getBoundingClientRect();
      // Se o campo saiu da tela, não faz sentido a lista ficar flutuando.
      if (!b || b.bottom < 0 || b.top > window.innerHeight) close(false);
      else place();
    };
    const onResize = () => place();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, place]);

  // Com pesquisa: o cursor vai direto para o campo ao abrir, só com mouse. No celular isso abria o teclado
  // sozinho, a tela encolhia e a lista pulava de lugar; lá a pessoa toca no campo se quiser pesquisar.
  useEffect(() => {
    if (open && withSearch && window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus({ preventScroll: true });
  }, [open, withSearch]);

  // Mantém a opção ativa visível ao navegar pelo teclado.
  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return;
    // Rola só a lista: scrollIntoView também rolaria a página, e rolar a página fecha o menu.
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
  }, [open, activeIndex]);

  // Anda só pelas opções que aparecem (com pesquisa, as que batem).
  const move = (from: number, step: number) => {
    const list = shownIdx.filter((i) => !options[i].disabled);
    if (list.length === 0) return -1;
    const pos = list.indexOf(from);
    if (pos < 0) return step > 0 ? list[0] : list[list.length - 1];
    return list[(pos + step + list.length) % list.length];
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => move(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => move(i, -1));
        break;
      case "Home":
        if (withSearch) break;
        e.preventDefault();
        setActiveIndex(move(-1, 1));
        break;
      case "End":
        if (withSearch) break;
        e.preventDefault();
        setActiveIndex(move(options.length, -1));
        break;
      case " ":
        if (withSearch) break;
        e.preventDefault();
        choose(activeIndex);
        break;
      case "Enter":
        e.preventDefault();
        choose(shownIdx.includes(activeIndex) ? activeIndex : shownIdx[0]);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (e.key.length === 1 && !withSearch) {
          // Busca pela digitação: pula para a opção que começa com as letras digitadas.
          const now = Date.now();
          typed.current.text = now - typed.current.at > 700 ? e.key : typed.current.text + e.key;
          typed.current.at = now;
          const q = typed.current.text.toLowerCase();
          const i = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(q));
          if (i >= 0) setActiveIndex(i);
        }
    }
  };

  const label = buttonLabel ?? selected?.label ?? placeholder ?? "";
  const isOn = active ?? (variant === "chip" && !!value);

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? `${autoId}-opt-${activeIndex}` : undefined}
        disabled={disabled}
        className={`bf-select bf-select-${variant} ${isOn ? "on" : ""} ${className}`}
        style={style}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        {icon}
        {!buttonLabel && selected?.color && <span className="dot" style={{ background: selected.color }} aria-hidden />}
        <span className={`bf-select-value ${selected || buttonLabel ? "" : "placeholder"}`}>{label}</span>
        <ChevronDown size={16} strokeWidth={1.8} className="bf-select-chevron" aria-hidden />
      </button>
      {open &&
        createPortal(
        <div ref={popRef} className={`bf-select-pop ${withSearch ? "has-search" : ""}`} style={pos}>
          {withSearch && (
            <label className="bf-select-search">
              <Search size={15} strokeWidth={1.8} aria-hidden />
              <input
                ref={searchRef}
                value={query}
                placeholder="Pesquisar"
                aria-label={`Pesquisar ${ariaLabel ?? placeholder ?? ""}`.trim()}
                aria-controls={listId}
                onChange={(e) => {
                  setQuery(e.target.value);
                  const nq = fold(e.target.value.trim());
                  setActiveIndex(options.findIndex((o) => !o.disabled && (!nq || fold(o.label).includes(nq))));
                }}
                onKeyDown={onKeyDown}
              />
            </label>
          )}
        <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="bf-select-list">
          {shownIdx.length === 0 && <li className="bf-select-empty">Nada com esse nome.</li>}
          {shownIdx.map((i) => {
            const o = options[i];
            return (
            <li
              key={o.value + i}
              id={`${autoId}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              className={`bf-select-option ${i === activeIndex ? "active" : ""}`}
              onPointerMove={() => !o.disabled && setActiveIndex(i)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.color && <span className="dot" style={{ background: o.color }} aria-hidden />}
              <span className="bf-select-option-label">{o.label}</span>
              {o.value === value && <Check size={16} strokeWidth={2} className="bf-select-check" aria-hidden />}
            </li>
            );
          })}
        </ul>
        </div>,
          document.body,
        )}
    </>
  );
}
