"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";

type Page<T> = { rows: T[]; next: string | null };

/**
 * Lista grande carregada aos poucos do servidor: busca (feita no servidor, com pequena espera ao digitar)
 * e "Ver mais" pela data do último item. Funciona para qualquer lista que tenha `{ rows, next }`.
 */
export function PagedList<T extends { id: string }>({
  initial,
  load,
  render,
  placeholder,
  empty = "Nada encontrado.",
  showSearch = true,
  className,
}: {
  initial: Page<T>;
  load: (input: { before?: string | null; q?: string }) => Promise<Page<T>>;
  render: (row: T) => React.ReactNode;
  placeholder: string;
  empty?: string;
  showSearch?: boolean;
  className?: string;
}) {
  const [rows, setRows] = useState(initial.rows);
  const [next, setNext] = useState(initial.next);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const first = useRef(true);
  const seq = useRef(0);

  // Buscar de novo do começo quando o texto muda (esperando a pessoa parar de digitar).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      start(async () => {
        const r = await load({ q });
        if (mine !== seq.current) return;
        setRows(r.rows);
        setNext(r.next);
      });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const more = () =>
    start(async () => {
      const r = await load({ before: next, q });
      setRows((x) => [...x, ...r.rows.filter((n) => !x.some((o) => o.id === n.id))]);
      setNext(r.next);
    });

  return (
    <div className={className}>
      {showSearch && (
        <label className="list-search">
          <Search size={16} strokeWidth={1.9} aria-hidden />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        </label>
      )}
      {rows.length === 0 ? (
        <p className="faint" style={{ marginTop: 10 }}>
          {pending ? "Buscando…" : empty}
        </p>
      ) : (
        rows.map((r) => <div key={r.id}>{render(r)}</div>)
      )}
      {next && (
        <button type="button" className="awaiting-more" disabled={pending} onClick={more}>
          {pending ? "Carregando…" : "Ver mais"}
        </button>
      )}
    </div>
  );
}
