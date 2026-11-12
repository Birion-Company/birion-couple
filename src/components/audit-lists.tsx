"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { loadAuditFeed, type FeedRow } from "@/app/actions/history";
import { PagedList } from "./paged-list";

const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Campo de busca que filtra na hora (sem acento, sem maiúsculas). */
function Filter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="list-search">
      <Search size={16} strokeWidth={1.9} aria-hidden />
      <input className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

/** Histórico da família na auditoria: páginas do servidor, com busca, agrupado visualmente por data e hora. */
export function AuditFeed({ householdId, initial }: { householdId: string; initial: { rows: FeedRow[]; next: string | null } }) {
  return (
    <PagedList
      initial={initial}
      load={(input) => loadAuditFeed({ householdId, ...input })}
      placeholder="Buscar no histórico (pessoa, lançamento, valor…)"
      empty="Nada registrado ainda."
      className="audit-feed"
      render={(f) => (
        <div className="audit-day">
          <p className="audit-day-label">
            {new Date(f.when).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" })}{" "}
            {new Date(f.when).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
          </p>
          <span className="audit-text">
            {f.text}
          </span>
          {f.detail && <span className="faint audit-detail"> · {f.detail}</span>}
        </div>
      )}
    />
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
