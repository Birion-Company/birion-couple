"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Maximize2, Minimize2, RotateCcw, SlidersHorizontal } from "lucide-react";

export type DashSize = "small" | "medium" | "full";
export type DashBlock = { id: string; label: string; size: DashSize; node: ReactNode };

const KEY = "bf-dash-v1";
const WIDE_KEY = "bf-wide";
const SPAN: Record<DashSize, number> = { small: 4, medium: 6, full: 12 };
const NEXT: Record<DashSize, DashSize> = { small: "medium", medium: "full", full: "small" };
const SIZE_NAME: Record<DashSize, string> = { small: "pequeno", medium: "médio", full: "inteiro" };

type Saved = { order: string[]; sizes: Record<string, DashSize> };

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && Array.isArray(raw.order) && raw.sizes && typeof raw.sizes === "object") return raw;
  } catch {}
  return { order: [], sizes: {} };
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

function Block({ block, size, editing, onSize }: { block: DashBlock; size: DashSize; editing: boolean; onSize: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: !editing });
  const style: CSSProperties = {
    gridColumn: `span ${SPAN[size]}`,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={`dash-block s-${size}${editing ? " editing" : ""}`}>
      {editing && (
        <div className="dash-tools">
          <button type="button" className="dash-grip" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Mover ${block.label}`} title="Arraste para mover">
            <GripVertical size={16} />
            <span>{block.label}</span>
          </button>
          <button type="button" className="dash-size" onClick={onSize} aria-label={`Tamanho de ${block.label}: ${SIZE_NAME[size]}. Trocar`} title={`Tamanho: ${SIZE_NAME[size]}`}>
            {size === "full" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      )}
      <div className={editing ? "dash-body no-click" : "dash-body"}>{block.node}</div>
    </div>
  );
}

/**
 * Blocos do painel que cada pessoa organiza do seu jeito: arrastar para mudar a ordem, trocar o tamanho
 * (pequeno, médio, inteiro) e deixar a página mais larga. Fica guardado neste aparelho.
 */
export function DashBoard({ blocks }: { blocks: DashBlock[] }) {
  const [saved, setSaved] = useState<Saved>({ order: [], sizes: {} });
  const [editing, setEditing] = useState(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    setSaved(load());
    setWide(document.documentElement.getAttribute("data-wide") === "1");
  }, []);

  const ids = blocks.map((b) => b.id);
  // Ordem guardada primeiro; blocos novos (ou que mudaram de lugar no código) entram no fim, na ordem de sempre.
  const order = [...saved.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !saved.order.includes(id))];
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const sizeOf = (b: DashBlock) => saved.sizes[b.id] ?? b.size;

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
          <button type="button" className="btn" onClick={() => commit({ order: [], sizes: {} })}>
            <RotateCcw size={15} /> Voltar ao padrão
          </button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="dash-grid">
            {order.map((id) => {
              const b = byId.get(id)!;
              return <Block key={id} block={b} size={sizeOf(b)} editing={editing} onSize={() => commit({ ...saved, order, sizes: { ...saved.sizes, [id]: NEXT[sizeOf(b)] } })} />;
            })}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
