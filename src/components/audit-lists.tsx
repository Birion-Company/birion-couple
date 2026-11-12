"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PAGE = 40;

/** Campo de busca que filtra na hora (sem acento, sem maiúsculas). */
function Filter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="list-search">
      <Search size={16} strokeWidth={1.9} aria-hidden />
      <input className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

type FeedRow = { id: string; when: string; text: string; detail: string | null };

/** Histórico da família na auditoria: busca, agrupado por dia, 40 por vez ("Ver mais"). */
export function AuditFeed({ items }: { items: FeedRow[] }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => (q.trim() ? items.filter((f) => fold(`${f.text} ${f.detail ?? ""}`).includes(fold(q.trim()))) : items), [items, q]);
  const days = new Map<string, FeedRow[]>();
  for (const f of list.slice(0, shown)) {
    const k = new Date(f.when).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
    days.set(k, [...(days.get(k) ?? []), f]);
  }
  return (
    <>
      <Filter
        value={q}
        onChange={(v) => {
          setQ(v);
          setShown(PAGE);
        }}
        placeholder="Buscar no histórico (pessoa, lançamento, valor…)"
      />
      {list.length === 0 && <p className="faint">Nada encontrado.</p>}
      {[...days].map(([day, rows]) => (
        <div key={day} className="audit-day">
          <p className="audit-day-label">{day}</p>
          <ol className="audit-feed">
            {rows.map((f) => (
              <li key={f.id}>
                <span className="audit-time">{new Date(f.when).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
                <span className="grow">
                  <span className="audit-text">{f.text}</span>
                  {f.detail && <span className="faint audit-detail">{f.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {list.length > shown && (
        <button type="button" className="awaiting-more" onClick={() => setShown((n) => n + PAGE)}>
          Ver mais {Math.min(PAGE, list.length - shown)} de {list.length - shown}
        </button>
      )}
    </>
  );
}

type Contact = { id: string; name: string; color: string; archived: boolean };

/** Contatos da família na auditoria: busca e 30 por vez. */
export function AuditContacts({ items }: { items: Contact[] }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(30);
  const list = q.trim() ? items.filter((c) => fold(c.name).includes(fold(q.trim()))) : items;
  return (
    <>
      {items.length > 10 && <Filter value={q} onChange={setQ} placeholder="Buscar contato" />}
      <p className="audit-contacts">
        {list.slice(0, shown).map((c) => (
          <span key={c.id} className="chip">
            <span className="dot" style={{ background: c.color }} aria-hidden /> {c.name}
            {c.archived ? <span className="faint"> · escondido</span> : null}
          </span>
        ))}
      </p>
      {list.length > shown && (
        <button type="button" className="awaiting-more" onClick={() => setShown((n) => n + 30)}>
          Ver mais {list.length - shown}
        </button>
      )}
    </>
  );
}
