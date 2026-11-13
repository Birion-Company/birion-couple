"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, SlidersHorizontal } from "lucide-react";

/** "wide" ocupa a linha toda; "card" divide a linha com os outros e se ajusta sozinho à largura. */
export type DashKind = "wide" | "card";
export type DashBlock = { id: string; label: string; size: DashKind; node: ReactNode; /** Ajusta-se ao próprio conteúdo: não estica até a altura do vizinho da linha. */ fit?: boolean };

const KEY = "bf-dash-v1";
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
    <div ref={setNodeRef} style={style} className={`dash-block${editing ? " editing" : ""}${block.fit ? " fit" : ""}`}>
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

  // Lê o que está guardado só depois de montar (no servidor não existe localStorage; evita diferença na hidratação).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSaved(load());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const ids = blocks.map((b) => b.id);
  // Ordem guardada primeiro; blocos novos (ou que mudaram de lugar no código) entram no fim, na ordem de sempre.
  const byId = new Map(blocks.map((b) => [b.id, b]));
  // Ordem de fábrica: nas sequências de cartões, os que se ajustam ao conteúdo (A pagar e a receber, Metas) vêm
  // primeiro e ficam lado a lado, em vez de ao lado de um bloco alto (que deixaria um vazio embaixo deles).
  const factory = (() => {
    const out: string[] = [];
    for (let i = 0; i < ids.length; ) {
      if (byId.get(ids[i])!.size === "wide") {
        out.push(ids[i++]);
        continue;
      }
      let j = i;
      while (j < ids.length && byId.get(ids[j])!.size === "card") j++;
      const run = ids.slice(i, j);
      out.push(...run.filter((id) => byId.get(id)!.fit), ...run.filter((id) => !byId.get(id)!.fit));
      i = j;
    }
    return out;
  })();
  const order = [...saved.order.filter((id) => ids.includes(id)), ...factory.filter((id) => !saved.order.includes(id))];
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
  // Celular (uma coluna): em vez de arrastar blocos grandes, uma lista curta com subir e descer.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [moved, setMoved] = useState<string | null>(null);
  const move = (id: string, dir: -1 | 1) => {
    const from = order.indexOf(id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= order.length) return;
    commit({ ...saved, order: arrayMove(order, from, to) });
    setMoved(id);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.indexOf(String(e.active.id));
    const to = order.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    commit({ ...saved, order: arrayMove(order, from, to) });
  };
  return (
    <>
      <div className="dash-bar">
        <button type="button" className={`btn${editing ? " primary" : ""}`} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
          <SlidersHorizontal size={15} /> {editing ? "Pronto" : "Organizar"}
        </button>
        {editing && (
          <button type="button" className="btn" onClick={() => commit({ order: [] })}>
            <RotateCcw size={15} /> Voltar ao padrão
          </button>
        )}
      </div>
      {editing && compact ? (
        <ol className="dash-order" aria-label="Ordem dos blocos">
          {order.map((id, i) => (
            <li key={id} className={moved === id ? "moved" : undefined} onAnimationEnd={() => setMoved(null)}>
              <span className="dash-order-n">{i + 1}</span>
              <span className="dash-order-label">{byId.get(id)!.label}</span>
              <button type="button" className="icon-btn" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Subir ${byId.get(id)!.label}`}>
                <ArrowUp size={18} />
              </button>
              <button type="button" className="icon-btn" onClick={() => move(id, 1)} disabled={i === order.length - 1} aria-label={`Descer ${byId.get(id)!.label}`}>
                <ArrowDown size={18} />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="dash-grid" ref={gridRef} style={editing && compact ? { display: "none" } : undefined}>
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
