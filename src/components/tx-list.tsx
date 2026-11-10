"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Pencil, Repeat, X } from "lucide-react";
import { BulkEditDialog } from "./bulk-edit";
import { deleteTransactions } from "@/app/actions/transactions";
import { missingInfo } from "@/lib/explain";
import type { Lookups, TxRow } from "@/lib/queries";
import { toastResult } from "./toaster";
import { ProfitAmount, StatusDot, amountTone, TxExplain, txLook, txMeta, txProfit } from "./tx-row";
import { CategoryIcon, Money, formatDate } from "./ui";

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
  showMissing = false,
  emptyText = "Nenhum lançamento com esses filtros.",
}: {
  rows: TxRow[];
  /** Mostra o que falta preencher (página "A identificar"). */
  showMissing?: boolean;
  emptyText?: string;
  lookups: Lookups;
  currency: string;
  /** Quem está vendo: só marca para ações em lote o que pode alterar. */
  viewer: { userId: string; admin: boolean; participantId: string | null };
}) {
  const canEdit = (r: TxRow) => viewer.admin || r.createdBy === viewer.userId;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const router = useRouter();

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
          {emptyText}
        </div>
      </div>
    );
  }

  const ids = [...selected];
  const editable = rows.filter(canEdit);
  const allOn = editable.length > 0 && editable.every((r) => selected.has(r.id));

  return (
    <>
      {editable.length > 0 && (
        <div className="select-all">
          <label className="check">
            <input
              type="checkbox"
              checked={allOn}
              onChange={() => setSelected(allOn ? new Set() : new Set(editable.map((r) => r.id)))}
              className="tx-check"
            />
            <span>{allOn ? "Desmarcar todos" : `Selecionar todos (${editable.length})`}</span>
          </label>
          <span className="faint">Marque vários para editar ou excluir de uma vez.</span>
        </div>
      )}
      <section className="card tx-months">
        {groupByMonth(rows).map((g) => (
          <div key={g.key} className="tx-month">
            <h2 className="tx-month-label">{g.label}</h2>
            <div className="rows">
              {g.rows.map((tx) => {
                const { cat, status, project, series } = txMeta(tx, lookups);
                const look = txLook(tx, cat);
                const details = [formatDate(tx.date), look.name, project?.name].filter(Boolean).join(" · ");
                return (
                  <div key={tx.id} className={`row tx-line ${txProfit(tx) > 0 ? "has-profit" : ""}`}>
                    <input
                      type="checkbox"
                      aria-label={canEdit(tx) ? `Selecionar ${tx.description}` : `${tx.description} (lançado por outra pessoa)`}
                      title={canEdit(tx) ? undefined : "Lançado por outra pessoa"}
                      disabled={!canEdit(tx)}
                      checked={selected.has(tx.id)}
                      onChange={() => toggle(tx.id)}
                      className="tx-check"
                    />
                    <Link href={`/transacoes/${tx.id}${showMissing ? "?voltar=identificar" : ""}`} className="grow tx-line-link">
                      <StatusDot status={status} />
                      <CategoryIcon icon={look.icon} color={look.color} title={look.name} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <p className="title tx-title">
                          <span className="tx-desc" title={tx.description}>{tx.description}</span>
                          {series && <span className="tx-series">{series}</span>}
                          {tx.source === "previsto" && (
                            <span className="tx-tag predicted" title="Parcela prevista: o extrato confirma sem duplicar.">
                              prevista
                            </span>
                          )}
                          {tx.recurring && (
                            <span className="tx-tag recurring" title="Compra recorrente: as próximas herdam categoria e divisão.">
                              <Repeat size={11} strokeWidth={2.2} aria-hidden /> recorrente
                            </span>
                          )}
                        </p>
                        <p className="sub tx-meta">{details}</p>
                        <TxExplain tx={tx} lookups={lookups} me={viewer.participantId} currency={currency} />
                        {showMissing && missingInfo(tx).length > 0 && (
                          <p className="missing-line">
                            <span className="missing-chip">Falta: {missingInfo(tx).join(", ")}</span>
                          </p>
                        )}
                      </div>
                      <span className="amount">
                        <Money cents={tx.amountCents} currency={currency} className={amountTone(tx.kind)} />
                        {status && <span className="sub tx-status">{status.name}</span>}
                        <ProfitAmount tx={tx} currency={currency} />
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {editing && (
        <BulkEditDialog
          ids={ids}
          lookups={lookups}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
      {selected.size > 0 && (
        <div className="bulkbar" role="region" aria-label="Ações para os selecionados">
          <button className="icon-btn" style={{ color: "#fff", width: 32, height: 32 }} onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
            <X size={16} />
          </button>
          <strong style={{ fontWeight: 500, fontSize: "0.9rem" }}>{selected.size} selecionado(s)</strong>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn small primary" disabled={pending} onClick={() => setEditing(true)}>
            <Pencil size={14} /> Editar<span className="hide-sm"> em lote</span>
          </button>
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
