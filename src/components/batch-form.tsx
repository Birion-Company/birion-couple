"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createMany } from "@/app/actions/batch";
import { formatMoney, parseAmountToCents } from "@/lib/money";
import type { Lookups } from "@/lib/queries";
import { Select } from "./select";
import { toast, toastResult } from "./toaster";
import { Avatar } from "./ui";

type Row = { key: number; date: string; description: string; amount: string; categoryId: string; noCategory?: boolean };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let seq = 0;
const emptyRow = (date: string): Row => ({ key: ++seq, date, description: "", amount: "", categoryId: "" });

/** Lançar vários de uma vez: as configurações de cima valem para todas as linhas. */
export function BatchForm({ lookups, currency, me }: { lookups: Lookups; currency: string; me: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const people = lookups.participants.filter((p) => !p.archived);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [payerId, setPayerId] = useState(me && people.some((p) => p.id === me) ? me : people[0]?.id ?? "");
  const [splitIds, setSplitIds] = useState<string[]>(payerId ? [payerId] : []);
  const [cardId, setCardId] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(today()), emptyRow(today()), emptyRow(today())]);

  const cards = lookups.cards.filter((c) => !c.archived && (!c.ownerId || c.ownerId === payerId));
  const filled = rows.filter((r) => r.description.trim() || r.amount.trim());
  const total = filled.reduce((a, r) => a + (parseAmountToCents(r.amount, ",") ?? 0), 0);
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = () => {
    const bad = filled.find((r) => !r.description.trim() || !(parseAmountToCents(r.amount, ",")! > 0) || !r.date);
    if (filled.length === 0) return toast("Preencha pelo menos uma linha.", "error");
    if (bad) return toast("Toda linha preenchida precisa de data, descrição e valor.", "error");
    if (splitIds.length === 0) return toast("Escolha quem divide.", "error");
    start(async () => {
      const r = await createMany({
        kind,
        payerId: payerId || null,
        splitIds,
        cardId: kind === "expense" ? cardId || null : null,
        projectId: null,
        rows: filled.map((x) => ({ date: x.date, description: x.description.trim(), amountCents: parseAmountToCents(x.amount, ",")!, categoryId: kind === "expense" && !x.noCategory ? x.categoryId || null : null, noCategory: kind === "expense" && !!x.noCategory })),
      });
      toastResult(r);
      if (r.ok) {
        router.push("/transacoes");
        router.refresh();
      }
    });
  };

  return (
    <div className="batch">
      <section className="card section">
        <h2 className="batch-title">Vale para todas as linhas</h2>
        <div className="form">
          <div className="segmented" role="group" aria-label="Tipo">
            <button type="button" aria-pressed={kind === "expense"} onClick={() => setKind("expense")}>
              Despesas
            </button>
            <button type="button" aria-pressed={kind === "income"} onClick={() => setKind("income")}>
              Receitas
            </button>
          </div>
          <div className="field-row">
            <label className="field">
              <span>{kind === "income" ? "Quem recebeu" : "Quem pagou"}</span>
              <Select
                value={payerId}
                onChange={(v) => {
                  setPayerId(v);
                  const c = lookups.cards.find((x) => x.id === cardId);
                  if (c?.ownerId && c.ownerId !== v) setCardId("");
                }}
                options={[...people.map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
              />
            </label>
          </div>
          {kind === "expense" && cards.length > 0 && (
            <label className="field">
              <span>Cartão de crédito</span>
              <Select value={cardId} onChange={setCardId} options={[{ value: "", label: "Não foi no cartão" }, ...cards.map((c) => ({ value: c.id, label: c.name, color: c.color }))]} />
            </label>
          )}
          <div className="field">
            <span className="label-text">{kind === "income" ? "De quem é esse dinheiro (partes iguais)" : "Quem deveria pagar (partes iguais)"}</span>
            <div className="person-pills" style={{ margin: 0, flexWrap: "wrap" }}>
              {people.map((p) => {
                const on = splitIds.includes(p.id);
                return (
                  <button key={p.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setSplitIds((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}>
                    <Avatar name={p.name} color={p.color} size={22} src={p.avatarUrl} /> {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="card section">
        <h2 className="batch-title">Lançamentos</h2>
        <div className="batch-rows">
          <div className="batch-row batch-row-head" aria-hidden>
            <span>Data</span>
            <span>Descrição</span>
            <span>Valor</span>
            <span>{kind === "expense" ? "Categoria" : ""}</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className="batch-row" role="group" aria-label={`Linha ${i + 1}`}>
              <input className="input" type="date" value={r.date} onChange={(e) => set(r.key, { date: e.target.value })} aria-label={`Data da linha ${i + 1}`} />
              <input className="input" value={r.description} onChange={(e) => set(r.key, { description: e.target.value })} placeholder="Ex.: Mercado" maxLength={200} aria-label={`Descrição da linha ${i + 1}`} />
              <input
                className="input num"
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => set(r.key, { amount: e.target.value.replace(/[^\d,.]/g, "") })}
                placeholder="0,00"
                aria-label={`Valor da linha ${i + 1}`}
              />
              {kind === "expense" ? (
                <div className="cat-cell">
                  <Select
                    ariaLabel={`Categoria da linha ${i + 1}`}
                    value={r.noCategory ? "" : r.categoryId}
                    disabled={r.noCategory}
                    onChange={(v) => set(r.key, { categoryId: v })}
                    options={[{ value: "", label: "Sem categoria" }, ...lookups.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, color: c.color }))]}
                  />
                  <span className="check no-category small">
                    <input id={`nocat-${r.key}`} type="checkbox" checked={!!r.noCategory} onChange={(e) => set(r.key, { noCategory: e.target.checked })} />
                    <label htmlFor={`nocat-${r.key}`}>Não precisa de categoria</label>
                  </span>
                </div>
              ) : (
                <span />
              )}
              <button type="button" className="icon-btn" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))} aria-label={`Remover linha ${i + 1}`} disabled={rows.length === 1}>
                <Trash2 size={16} strokeWidth={1.6} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={() => setRows((rs) => [...rs, emptyRow(rs[rs.length - 1]?.date ?? today())])} disabled={rows.length >= 100}>
          <Plus size={15} /> Adicionar linha
        </button>
      </section>

      <div className="card section batch-footer">
        <p>
          {filled.length} {filled.length === 1 ? "lançamento" : "lançamentos"} · <strong className="num">{formatMoney(total, currency)}</strong>
        </p>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => router.back()} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={pending || filled.length === 0}>
            {pending ? "Salvando…" : `Salvar ${filled.length || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
