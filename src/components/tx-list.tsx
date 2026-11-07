"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Inbox, X } from "lucide-react";
import { bulkUpdate, deleteTransactions, setTransactionsStatus } from "@/app/actions/transactions";
import type { Lookups, TxRow } from "@/lib/queries";
import { Select } from "./select";
import { toastResult } from "./toaster";
import { amountTone, txMeta } from "./tx-row";
import { Dot, Money, formatDate } from "./ui";

function groupByMonth(rows: TxRow[]) {
  const groups: { key: string; label: string; rows: TxRow[] }[] = [];
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      g = { key, label: label.charAt(0).toUpperCase() + label.slice(1), rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}

export function TxList({ rows, lookups, currency }: { rows: TxRow[]; lookups: Lookups; currency: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      toastResult(r);
      if (r.ok) setSelected(new Set());
    });

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <Inbox size={36} strokeWidth={1.2} />
          Nenhum lançamento com esses filtros.
        </div>
      </div>
    );
  }

  const ids = [...selected];
  const activeStatuses = lookups.statuses.filter((s) => !s.archived);

  return (
    <>
      {groupByMonth(rows).map((g) => {
        const allOn = g.rows.every((r) => selected.has(r.id));
        return (
          <section key={g.key} className="card" style={{ marginBottom: 12, paddingTop: 10 }}>
            <div className="card-head" style={{ marginBottom: 4 }}>
              <h2 style={{ fontSize: "0.9rem" }} className="muted">{g.label}</h2>
              <label className="faint" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      g.rows.forEach((r) => (allOn ? n.delete(r.id) : n.add(r.id)));
                      return n;
                    })
                  }
                  style={{ accentColor: "var(--brand-strong)" }}
                />
                Selecionar
              </label>
            </div>
            <div className="rows">
              {g.rows.map((tx) => {
                const { payer, cat, status, project, people } = txMeta(tx, lookups);
                return (
                  <div key={tx.id} className="row">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${tx.description}`}
                      checked={selected.has(tx.id)}
                      onChange={() => toggle(tx.id)}
                      style={{ width: 18, height: 18, accentColor: "var(--brand-strong)", flex: "none" }}
                    />
                    <Link href={`/transacoes/${tx.id}`} className="grow" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <div className="grow">
                        <p className="title">{tx.description}</p>
                        <p className="sub">
                          {formatDate(tx.date)}
                          {payer ? ` · pago por ${payer.name}` : ""}
                          {people.length ? ` · ${people.length === lookups.participants.length && people.length > 2 ? "todos" : people.join(", ")}` : ""}
                        </p>
                        <p className="sub" style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          {cat && <span className="badge"><Dot color={cat.color} />{cat.name}</span>}
                          {project && <span className="badge"><Dot color={project.color} />{project.name}</span>}
                          {status && <span className="badge"><Dot color={status.color} />{status.name}</span>}
                        </p>
                      </div>
                      <span className="amount">
                        <Money cents={tx.amountCents} currency={currency} className={amountTone(tx.kind)} />
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {selected.size > 0 && (
        <div className="bulkbar" role="region" aria-label="Ações para os selecionados">
          <button className="icon-btn" style={{ color: "#fff", width: 32, height: 32 }} onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
            <X size={16} />
          </button>
          <strong style={{ fontWeight: 500, fontSize: "0.9rem" }}>{selected.size} selecionado(s)</strong>
          <span style={{ flex: 1 }} />
          <Select
            variant="bulk"
            ariaLabel="Marcar como"
            value=""
            placeholder="Marcar como…"
            disabled={pending}
            options={activeStatuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))}
            onChange={(v) => run(() => setTransactionsStatus(ids, v))}
          />
          <Select
            variant="bulk"
            ariaLabel="Mudar categoria"
            value=""
            placeholder="Categoria…"
            disabled={pending}
            options={[
              ...lookups.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, color: c.color })),
              { value: "none", label: "Sem categoria" },
            ]}
            onChange={(v) => run(() => bulkUpdate(ids, { categoryId: v === "none" ? null : v }))}
          />
          {lookups.projects.some((p) => !p.archived) && (
            <Select
              variant="bulk"
              ariaLabel="Mudar projeto"
              value=""
              placeholder="Projeto…"
              disabled={pending}
              options={[
                ...lookups.projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name, color: p.color })),
                { value: "none", label: "Sem projeto" },
              ]}
              onChange={(v) => run(() => bulkUpdate(ids, { projectId: v === "none" ? null : v }))}
            />
          )}
          <button
            className="btn small"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Excluir ${selected.size} lançamento(s)? Isso não pode ser desfeito.`)) run(() => deleteTransactions(ids));
            }}
          >
            Excluir
          </button>
        </div>
      )}
    </>
  );
}
