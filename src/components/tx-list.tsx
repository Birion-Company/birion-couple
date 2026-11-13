"use client";

import { ApprovalBadge } from "./approval";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Loader2, Pencil, Repeat, X } from "lucide-react";
import { BulkEditDialog } from "./bulk-edit";
import { confirmPurchase } from "@/app/actions/review";
import {
  deleteTransactions,
  loadMoreTransactions,
  skipCategory,
} from "@/app/actions/transactions";
import { missingInfo } from "@/lib/explain";
import type { Lookups, TxRow } from "@/lib/queries";
import { toastResult } from "./toaster";
import {
  ProfitAmount,
  StatusDot,
  TxAmount,
  TxExplain,
  txLook,
  txMeta,
  txProfit,
} from "./tx-row";
import { CategoryIcon, formatDate } from "./ui";

function groupByMonth(rows: TxRow[]) {
  const groups: { key: string; label: string; rows: TxRow[] }[] = [];
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });
      g = {
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        rows: [],
      };
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}

/** Quantos itens vêm a cada vez que a pessoa chega perto do fim da lista. */
const MORE = 40;

export function TxList({
  rows: firstRows,
  more,
  lookups,
  currency,
  viewer,
  showMissing = false,
  emptyText = "Nenhum lançamento com esses filtros.",
}: {
  rows: TxRow[];
  /**
   * Lista longa: a página abre só com os primeiros; o resto vem aos poucos, sozinho, quando a pessoa
   * rola até perto do fim (não pesa o site). `query` = filtros da página; `total` = quantos existem.
   */
  more?: { query: string; total: number };
  /** Mostra o que falta preencher (página "A identificar"). */
  showMissing?: boolean;
  emptyText?: string;
  lookups: Lookups;
  currency: string;
  /** Quem está vendo: só marca para ações em lote o que pode alterar. */
  viewer: { userId: string; admin: boolean; participantId: string | null };
}) {
  const canEdit = (r: TxRow) => viewer.admin || r.createdBy === viewer.userId;
  // Itens carregados depois (rolando). Quando a página recarrega (editou, mudou filtro), eles são
  // buscados de novo com os dados novos, mantendo a quantidade que a pessoa já tinha visto.
  const [extra, setExtra] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const seen = new Set(firstRows.map((r) => r.id));
  const rows = [...firstRows, ...extra.filter((r) => !seen.has(r.id))];
  const hasMore = !!more && rows.length < more.total;
  const lastFirst = useRef(firstRows);
  useEffect(() => {
    if (lastFirst.current === firstRows) return;
    lastFirst.current = firstRows;
    if (!more) return;
    const keep = extra.length;
    if (keep === 0) return;
    let alive = true;
    loadMoreTransactions(more.query, firstRows.length, keep)
      .then((r) => alive && setExtra(r))
      .catch(() => alive && setExtra([]));
    return () => {
      alive = false;
    };
  }, [firstRows, more, extra.length]);
  const loadMore = () => {
    if (!more || loading || !hasMore) return;
    setLoading(true);
    setFailed(false);
    loadMoreTransactions(more.query, rows.length, MORE)
      .then((r) => setExtra((x) => [...x, ...r]))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };
  const loadRef = useRef(loadMore);
  useEffect(() => {
    loadRef.current = loadMore;
  });
  // Chegou perto do fim (uns 600px antes): busca os próximos.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (e) => e[0]?.isIntersecting && loadRef.current(),
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, rows.length]);
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

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) =>
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
  const allOn =
    editable.length > 0 && editable.every((r) => selected.has(r.id));

  return (
    <>
      {editable.length > 0 && (
        <div className="select-all">
          <label className="check">
            <input
              type="checkbox"
              checked={allOn}
              onChange={() =>
                setSelected(
                  allOn ? new Set() : new Set(editable.map((r) => r.id)),
                )
              }
              className="tx-check"
            />
            <span>
              {allOn
                ? "Desmarcar todos"
                : `Selecionar todos (${editable.length})`}
            </span>
          </label>
          <span className="faint">
            Marque vários para editar ou excluir de uma vez.
          </span>
        </div>
      )}
      <section className="card tx-months">
        {groupByMonth(rows).map((g, gi) => (
          <div key={g.key} className="tx-month">
            <h2 className="tx-month-label">{g.label}</h2>
            <div className="rows">
              {g.rows.map((tx, ti) => {
                const { cat, status, project, series } = txMeta(tx, lookups);
                const look = txLook(tx, cat);
                const details = [formatDate(tx.date), look.name, project?.name]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    key={tx.id}
                    className={`row tx-line ${txProfit(tx) > 0 ? "has-profit" : ""}`}
                    data-tour={gi === 0 && ti === 0 ? "tx-first" : undefined}
                  >
                    <input
                      type="checkbox"
                      aria-label={
                        canEdit(tx)
                          ? `Selecionar ${tx.description}`
                          : `${tx.description} (lançado por outra pessoa)`
                      }
                      title={
                        canEdit(tx) ? undefined : "Lançado por outra pessoa"
                      }
                      disabled={!canEdit(tx)}
                      checked={selected.has(tx.id)}
                      onChange={() => toggle(tx.id)}
                      className="tx-check"
                    />
                    <Link
                      href={`/transacoes/${tx.id}${showMissing ? "?voltar=identificar" : ""}`}
                      className="grow tx-line-link"
                    >
                      <StatusDot status={status} />
                      <CategoryIcon
                        icon={look.icon}
                        color={look.color}
                        title={look.name}
                      />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <p className="title tx-title">
                          <span
                            className={`tx-desc ${tx.kind === "expense" ? "neg" : ""}`}
                            title={tx.description}
                          >
                            {tx.description}
                          </span>
                          {series && (
                            <span className="tx-series">{series}</span>
                          )}
                          <ApprovalBadge
                            approval={tx.approval}
                            me={viewer.participantId}
                            names={Object.fromEntries(
                              lookups.participants.map((p) => [p.id, p.name]),
                            )}
                          />
                          {tx.source === "previsto" && (
                            <span
                              className="tx-tag predicted"
                              title="Parcela prevista: o extrato confirma sem duplicar."
                            >
                              prevista
                            </span>
                          )}
                          {tx.recurring && (
                            <span
                              className="tx-tag recurring"
                              title="Compra recorrente: as próximas herdam categoria e divisão."
                            >
                              <Repeat size={11} strokeWidth={2.2} aria-hidden />{" "}
                              recorrente
                            </span>
                          )}
                        </p>
                        <p className="sub tx-meta">{details}</p>
                        <TxExplain
                          tx={tx}
                          lookups={lookups}
                          me={viewer.participantId}
                          currency={currency}
                        />
                        {showMissing && tx.needsReview && (
                          <p className="missing-line">
                            <span className="missing-chip">Compra recebida do cartão: confira e confirme</span>
                          </p>
                        )}
                        {showMissing && missingInfo(tx).length > 0 && (
                          <p className="missing-line">
                            <span className="missing-chip">
                              Falta: {missingInfo(tx).join(", ")}
                            </span>
                          </p>
                        )}
                      </div>
                      <span className="amount">
                        <TxAmount tx={tx} currency={currency} />
                        {status && (
                          <span className="sub tx-status">{status.name}</span>
                        )}
                        <ProfitAmount tx={tx} currency={currency} />
                      </span>
                    </Link>
                    {showMissing && tx.needsReview && canEdit(tx) && (
                      <button
                        type="button"
                        className="btn small skip-category"
                        disabled={pending}
                        onClick={() => run(() => confirmPurchase(tx.id))}
                        title="Confirma que está certo: a compra passa a valer nas listas, na fatura e nas dívidas"
                      >
                        Confirmar
                      </button>
                    )}
                    {/* A identificar: despesa que não precisa de categoria sai da lista com um toque. */}
                    {showMissing && canEdit(tx) && missingInfo(tx).includes("categoria") && (
                      <button
                        type="button"
                        className="btn small ghost skip-category"
                        disabled={pending}
                        onClick={() => run(() => skipCategory([tx.id]))}
                        title="Fica sem categoria e sai de A identificar"
                      >
                        Não precisa de categoria
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Fim da lista: carrega mais sozinho ao chegar aqui; o botão é para quem preferir tocar. */}
      {hasMore && (
        <div ref={sentinel} className="tx-more" aria-live="polite">
          {loading ? (
            <span className="faint">
              <Loader2 size={15} className="spin" aria-hidden /> Carregando mais
              lançamentos…
            </span>
          ) : (
            <button
              type="button"
              className="btn ghost small"
              onClick={loadMore}
            >
              {failed
                ? "Não carregou. Tentar de novo"
                : `Mostrar mais (${more!.total - rows.length} restantes)`}
            </button>
          )}
        </div>
      )}
      {more && !hasMore && more.total > firstRows.length && (
        <p className="faint tx-more">Isso é tudo: {more.total} lançamentos.</p>
      )}

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
        <div
          className="bulkbar"
          role="region"
          aria-label="Ações para os selecionados"
        >
          <button
            className="icon-btn"
            style={{ color: "#fff", width: 32, height: 32 }}
            onClick={() => setSelected(new Set())}
            aria-label="Limpar seleção"
          >
            <X size={16} />
          </button>
          <strong style={{ fontWeight: 500, fontSize: "0.9rem" }}>
            {selected.size} selecionado(s)
          </strong>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn small primary"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} /> Editar<span className="hide-sm"> em lote</span>
          </button>
          <button
            className="btn small"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  `Excluir ${selected.size} lançamento(s)? Isso não pode ser desfeito.`,
                )
              )
                run(() => deleteTransactions(ids));
            }}
          >
            Excluir
          </button>
        </div>
      )}
    </>
  );
}
