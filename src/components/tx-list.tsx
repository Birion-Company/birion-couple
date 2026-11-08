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

export function TxList({
  rows,
  lookups,
  currency,
  viewer,
}: {
  rows: TxRow[];
  lookups: Lookups;
  currency: string;
  /** Quem está vendo: só marca para ações em lote o que pode alterar. */
  viewer: { userId: string; admin: boolean };
}) {
  const canEdit = (r: TxRow) => viewer.admin || r.createdBy === viewer.userId;
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
      <section className="card tx-months">
        {groupByMonth(rows).map((g) => (
          <div key={g.key} className="tx-month">
            <h2 className="tx-month-label">{g.label}</h2>
            <div className="rows">
              {g.rows.map((tx) => {
                const { payer, cat, status, project, card, series } = txMeta(tx, lookups);
                // Uma linha de detalhes só: data · categoria · cartão · projeto · quem pagou.
                const details = [formatDate(tx.date), cat?.name, card?.name, project?.name, payer ? `pago por ${payer.name}` : null].filter(Boolean).join(" · ");
                return (
                  <div key={tx.id} className="row tx-line">
                    <input
                      type="checkbox"
                      aria-label={canEdit(tx) ? `Selecionar ${tx.description}` : `${tx.description} (lançado por outra pessoa)`}
                      title={canEdit(tx) ? undefined : "Lançado por outra pessoa"}
                      disabled={!canEdit(tx)}
                      checked={selected.has(tx.id)}
                      onChange={() => toggle(tx.id)}
                      className="tx-check"
                    />
                    <Link href={`/transacoes/${tx.id}`} className="grow tx-line-link">
                      <Dot color={cat?.color ?? "#CBD5E1"} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <p className="title">
                          {tx.description}
                          {series && <span className="tx-series">{series.replace("Parcela ", "")}</span>}
                        </p>
                        <p className="sub">{details}</p>
                      </div>
                      <span className="amount">
                        <Money cents={tx.amountCents} currency={currency} className={amountTone(tx.kind)} />
                        {status && <span className="sub tx-status">{status.name}</span>}
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

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
