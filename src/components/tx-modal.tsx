"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { loadTxForEdit } from "@/app/actions/transactions";
import type { Lookups } from "@/lib/queries";
import { SeriesEditor } from "./series-editor";
import { TxForm } from "./tx-form";

type Loaded = NonNullable<Awaited<ReturnType<typeof loadTxForEdit>>>;

const TX_PATH = /^\/transacoes\/([0-9a-f-]{36})$/i;

/**
 * Editar lançamento numa janela: qualquer link para /transacoes/<id> (lista, painel, dívidas) abre o
 * formulário por cima da página, sem navegar. Ctrl/⌘+clique ou botão do meio abrem a página normal.
 */
export function TxModalHost({ lookups, currency, me }: { lookups: Lookups; currency: string; me: string | null }) {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setId(null);
    setData(null);
    setFailed(false);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.closest("[data-no-modal]")) return;
      const url = new URL(a.href, location.href);
      const m = url.origin === location.origin ? TX_PATH.exec(url.pathname) : null;
      if (!m) return;
      e.preventDefault();
      setData(null);
      setFailed(false);
      setId(m[1]);
      void loadTxForEdit(m[1]).then((d) => (d ? setData(d) : setFailed(true)));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Recebi, Desfazer ou mudar as parcelas dentro da janela: recarrega o lançamento.
  useEffect(() => {
    if (!id) return;
    const reload = () => void loadTxForEdit(id).then((d) => (d ? setData(d) : close()));
    window.addEventListener("bf:tx-changed", reload);
    return () => window.removeEventListener("bf:tx-changed", reload);
  }, [id, close]);

  useEffect(() => {
    if (!id) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Esc fecha a janela, a não ser que um menu de escolha esteja aberto (ele fecha primeiro).
      if (e.key === "Escape" && !document.querySelector(".bf-select-list")) close();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [id, close]);

  if (!id) return null;
  return createPortal(
    <div className="tx-modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} tabIndex={-1} className="tx-modal" role="dialog" aria-modal="true" aria-label={data ? (data.canEdit ? "Editar lançamento" : "Lançamento") : "Carregando"}>
        <div className="tx-modal-head">
          <h2>{data ? (data.canEdit ? "Editar lançamento" : "Lançamento") : "Carregando…"}</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {failed ? (
          <p className="faint">Não deu para abrir este lançamento.</p>
        ) : !data ? (
          <p className="faint tx-modal-loading">
            <Loader2 size={18} className="spin" aria-hidden /> Carregando…
          </p>
        ) : (
          <>
            {data.series && <SeriesEditor txId={data.tx.id} items={data.series.items} total={data.series.total} currency={currency} monthly={data.series.monthly} />}
            <TxForm
              key={`${data.tx.id}-${data.tx.date}-${data.tx.amountCents}-${data.tx.seriesTotal ?? 0}`}
              lookups={lookups}
              currency={currency}
              initial={data.tx}
              me={me}
              readOnly={!data.canEdit}
              createdByName={data.createdByName}
              onDone={close}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
