"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Maximize2, RotateCcw, SlidersHorizontal } from "lucide-react";

/** "wide" ocupa a linha toda; "card" divide a linha com os outros e se ajusta sozinho à largura. */
export type DashKind = "wide" | "card";
export type DashBlock = { id: string; label: string; size: DashKind; node: ReactNode };

const KEY = "bf-dash-v1";
const WIDE_KEY = "bf-wide";
/** Largura mínima de um cartão: quantas colunas cabem depende da área disponível. */
const CARD_MIN = 340;
const GAP = 16;
/** Colunas que cabem, arredondadas para baixo até um número que divide a grade de 12 (1, 2, 3, 4 ou 6). */
const fit = (n: number) => [6, 4, 3, 2, 1].find((c) => c <= n) ?? 1;

type Saved = { order: string[] };

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && Array.isArray(raw.order)) return { order: raw.order.filter((x: unknown) => typeof x === "string") };
  } catch {}
  return { order: [] };
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

/** Aplica a largura escolhida (normal ou ampla) em toda a área de conteúdo. */
export function applyWide(on: boolean) {
  const root = document.documentElement;
  if (on) root.setAttribute("data-wide", "1");
  else root.removeAttribute("data-wide");
}

function Block({ block, span, editing }: { block: DashBlock; span: number; editing: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: !editing });
  const style: CSSProperties = {
    gridColumn: `span ${span}`,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={`dash-block${editing ? " editing" : ""}`}>
      {editing && (
        <div className="dash-tools">
          <button type="button" className="dash-grip" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Mover ${block.label}`} title="Arraste para mover">
            <GripVertical size={16} />
            <span>{block.label}</span>
          </button>
        </div>
      )}
      <div className={editing ? "dash-body no-click" : "dash-body"}>{block.node}</div>
    </div>
  );
}

/**
 * Blocos do painel que cada pessoa organiza do seu jeito: arrastar para mudar a ordem, e deixar a página mais larga. Os cartões se encaixam sozinhos na área (colunas iguais, sem sobra no fim). Fica guardado neste aparelho.
 */
export function DashBoard({ blocks }: { blocks: DashBlock[] }) {
  const [saved, setSaved] = useState<Saved>({ order: [] });
  const [cols, setCols] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [wide, setWide] = useState(false);

  // Lê o que está guardado só depois de montar (no servidor não existe localStorage; evita diferença na hidratação).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSaved(load());
    setWide(document.documentElement.getAttribute("data-wide") === "1");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const ids = blocks.map((b) => b.id);
  // Ordem guardada primeiro; blocos novos (ou que mudaram de lugar no código) entram no fim, na ordem de sempre.
  const order = [...saved.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !saved.order.includes(id))];
  const byId = new Map(blocks.map((b) => [b.id, b]));
  // Quantas colunas cabem na área agora (muda com a página larga e com a tela).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setCols(fit(Math.floor((el.clientWidth + GAP) / (CARD_MIN + GAP))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Largura de cada bloco numa grade de 12 partes: "wide" pega a linha toda; os cartões se dividem por igual
  // em cada linha (a última linha incompleta também fecha certinho, sem buraco).
  const spans = new Map<string, number>();
  for (let i = 0; i < order.length; ) {
    if (byId.get(order[i])!.size === "wide") {
      spans.set(order[i], 12);
      i++;
      continue;
    }
    let j = i;
    while (j < order.length && byId.get(order[j])!.size === "card") j++;
    for (let r = i; r < j; r += cols) {
      const row = order.slice(r, Math.min(j, r + cols));
      const base = Math.floor(12 / row.length);
      const extra = 12 - base * row.length;
      row.forEach((id, k) => spans.set(id, base + (k >= row.length - extra ? 1 : 0)));
    }
    i = j;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commit = (next: Saved) => {
    setSaved(next);
    save(next);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.indexOf(String(e.active.id));
    const to = order.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    commit({ ...saved, order: arrayMove(order, from, to) });
  };
  const toggleWide = () => {
    const next = !wide;
    setWide(next);
    applyWide(next);
    try {
      localStorage.setItem(WIDE_KEY, next ? "1" : "0");
    } catch {}
  };

  return (
    <>
      <div className="dash-bar">
        <button type="button" className={`btn${wide ? " on" : ""}`} onClick={toggleWide} aria-pressed={wide}>
          <Maximize2 size={15} /> Página larga
        </button>
        <button type="button" className={`btn${editing ? " primary" : ""}`} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
          <SlidersHorizontal size={15} /> {editing ? "Pronto" : "Organizar"}
        </button>
        {editing && (
          <button type="button" className="btn" onClick={() => commit({ order: [] })}>
            <RotateCcw size={15} /> Voltar ao padrão
          </button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="dash-grid" ref={gridRef}>
            {order.map((id) => {
              const b = byId.get(id)!;
              return <Block key={id} block={b} span={spans.get(id) ?? 12} editing={editing} />;
            })}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
