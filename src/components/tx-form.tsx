"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CreditCard, Repeat, Trash2 } from "lucide-react";
import { deleteSeries, deleteTransactions, saveTransaction } from "@/app/actions/transactions";
import { addMonthsIso, invoiceDates, invoiceOf, monthLabel, seriesLabel, shortDate } from "@/lib/cards";
import { centsToInput, formatMoney, parseAmountToCents, splitEqually } from "@/lib/money";
import type { Lookups, TxRow } from "@/lib/queries";
import { Select } from "./select";
import { toast, toastResult } from "./toaster";
import { Avatar } from "./ui";

type Kind = "expense" | "income" | "transfer";
type Repeat = "once" | "installment" | "monthly";

export type TxPrefill = Partial<Pick<TxRow, "kind" | "payerId" | "amountCents" | "description">> & { toId?: string };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TxForm({
  lookups,
  currency,
  initial,
  prefill,
  defaultStatusId,
  me,
}: {
  lookups: Lookups;
  currency: string;
  initial: TxRow | null;
  prefill?: TxPrefill;
  defaultStatusId: string | null;
  me: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const people = lookups.participants.filter(
    (p) => !p.archived || p.id === initial?.payerId || initial?.splits.some((s) => s.participantId === p.id),
  );
  const firstPerson = me && people.some((p) => p.id === me) ? me : people[0]?.id ?? "";

  const [kind, setKind] = useState<Kind>(initial?.kind ?? prefill?.kind ?? "expense");
  const [amount, setAmount] = useState(
    initial ? centsToInput(initial.amountCents) : prefill?.amountCents ? centsToInput(prefill.amountCents) : "",
  );
  const [description, setDescription] = useState(initial?.description ?? prefill?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [payerId, setPayerId] = useState(initial?.payerId ?? prefill?.payerId ?? firstPerson);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [statusId, setStatusId] = useState(
    initial?.statusId ??
      (prefill?.kind === "transfer" ? lookups.statuses.find((s) => s.behavior === "open" && !s.archived)?.id : undefined) ??
      defaultStatusId ??
      "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const cards = lookups.cards.filter((c) => !c.archived || c.id === initial?.cardId);
  const [cardId, setCardId] = useState(initial?.cardId ?? "");
  const [repeat, setRepeat] = useState<Repeat>("once");
  const [count, setCount] = useState("10");
  const [applyToSeries, setApplyToSeries] = useState(true);
  const card = cards.find((c) => c.id === cardId) ?? null;
  const n = Math.min(Math.max(Number(count) || 0, 0), repeat === "installment" ? 48 : 60);
  const isSeries = !initial && kind !== "transfer" && repeat !== "once";

  const initialSplitIds = initial?.splits.map((s) => s.participantId) ?? (prefill?.toId ? [prefill.toId] : people.filter((p) => !p.archived).map((p) => p.id));
  const [splitIds, setSplitIds] = useState<string[]>(initialSplitIds);
  const equalBefore = useMemo(() => {
    if (!initial) return true;
    const parts = splitEqually(initial.amountCents, initial.splits.length);
    return initial.splits.every((s, i) => s.amountCents === parts[i]);
  }, [initial]);
  const [mode, setMode] = useState<"equal" | "custom">(equalBefore ? "equal" : "custom");
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries((initial?.splits ?? []).map((s) => [s.participantId, centsToInput(s.amountCents)])),
  );

  const cents = parseAmountToCents(amount, ",") ?? 0;
  const customSum = splitIds.reduce((a, id) => a + (parseAmountToCents(custom[id] ?? "", ",") ?? 0), 0);
  const equalParts = splitEqually(Math.max(0, cents), splitIds.length);

  const toggleSplit = (id: string) =>
    setSplitIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : people.map((p) => p.id).filter((x) => x === id || s.includes(x))));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cents <= 0) return toast("Digite um valor maior que zero.", "error");
    if (kind === "transfer" && splitIds.length !== 1) return toast("Escolha para quem foi o acerto.", "error");
    if (mode === "custom" && kind !== "transfer" && customSum !== cents) {
      return toast(`As partes somam ${formatMoney(customSum, currency)}, mas o total é ${formatMoney(cents, currency)}.`, "error");
    }
    if (isSeries && (n < 2 || String(n) !== count.trim())) {
      return toast(repeat === "installment" ? "Escolha de 2 a 48 parcelas." : "Escolha de 2 a 60 meses.", "error");
    }
    start(async () => {
      const r = await saveTransaction(initial?.id ?? null, {
        date,
        description: description || (kind === "transfer" ? "Acerto" : ""),
        amountCents: cents,
        kind,
        payerId: payerId || null,
        categoryId: kind === "transfer" ? null : categoryId || null,
        projectId: projectId || null,
        statusId: statusId || null,
        cardId: kind === "transfer" ? null : cardId || null,
        notes,
        series: isSeries ? { kind: repeat as "installment" | "monthly", count: n } : null,
        applyToSeries: initial?.seriesId ? applyToSeries : undefined,
        splitMode: mode === "custom" && kind !== "transfer" ? "custom" : "equal",
        splits: splitIds.map((participantId) => ({
          participantId,
          amountCents: parseAmountToCents(custom[participantId] ?? "", ",") ?? 0,
        })),
      });
      toastResult(r);
      if (r.ok) {
        router.push(initial ? "/transacoes" : "/painel");
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!initial || !window.confirm("Excluir este lançamento?")) return;
    start(async () => {
      const r = await deleteTransactions([initial.id]);
      toastResult(r);
      if (r.ok) {
        router.push("/transacoes");
        router.refresh();
      }
    });
  };

  const removeSeries = (scope: "next" | "all") => {
    if (!initial) return;
    const what = scope === "all" ? "todas as parcelas desta compra" : "esta parcela e as próximas";
    if (!window.confirm(`Excluir ${what}?`)) return;
    start(async () => {
      const r = await deleteSeries(initial.id, scope);
      toastResult(r);
      if (r.ok) {
        router.push("/transacoes");
        router.refresh();
      }
    });
  };

  const payerLabel = kind === "income" ? "Quem recebeu" : kind === "transfer" ? "Quem pagou o acerto" : "Quem pagou";
  const amountLabel = isSeries ? (repeat === "installment" ? "Valor total da compra" : "Valor por mês") : "Valor";
  const seriesWord = initial?.seriesKind === "monthly" ? "lançamento recorrente" : "compra parcelada";

  // Em qual fatura cai (e, no parcelamento, até quando vai).
  let cardHint: string | null = null;
  if (card && kind !== "transfer" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const first = invoiceOf(date, card.closingDay);
    const d = invoiceDates(first, card);
    if (isSeries && n >= 2) {
      const last = invoiceOf(addMonthsIso(date, n - 1), card.closingDay);
      cardHint = `1ª na fatura de ${monthLabel(first)} (vence ${shortDate(d.due)}), última na de ${monthLabel(last)}.`;
    } else {
      cardHint = `Entra na fatura de ${monthLabel(first)}: fecha ${shortDate(d.closing)} e vence ${shortDate(d.due)}.`;
    }
  }

  // Resumo das parcelas.
  let seriesHint: string | null = null;
  if (isSeries && n >= 2 && cents > 0) {
    if (repeat === "installment") {
      const parts = splitEqually(cents, n);
      seriesHint =
        parts[0] === parts[n - 1]
          ? `${n}x de ${formatMoney(parts[0], currency)}`
          : `${n}x de ${formatMoney(parts[n - 1], currency)} (as primeiras com ${formatMoney(parts[0] - parts[n - 1], currency)} a mais)`;
    } else {
      seriesHint = `${n} lançamentos de ${formatMoney(cents, currency)}, de ${monthLabel(date.slice(0, 7))} a ${monthLabel(addMonthsIso(date, n - 1).slice(0, 7))} · total ${formatMoney(cents * n, currency)}`;
    }
  }
  const sharesNow = mode === "equal" ? equalParts : splitIds.map((id) => parseAmountToCents(custom[id] ?? "", ",") ?? 0);

  return (
    <form className="form" onSubmit={submit}>
      {initial?.seriesId && (
        <div className="series-notice">
          <p className="series-notice-title">
            <Repeat size={16} strokeWidth={1.8} aria-hidden />
            {seriesLabel(initial.seriesKind, initial.seriesIndex, initial.seriesTotal)} de uma {seriesWord}
          </p>
          <label className="check">
            <input type="checkbox" checked={applyToSeries} onChange={(e) => setApplyToSeries(e.target.checked)} />
            <span>Levar descrição, categoria, projeto, cartão, quem pagou e observações para as outras parcelas</span>
          </label>
          <p className="faint">Valor, data, divisão e status mudam só nesta.</p>
          <div className="actions">
            <button type="button" className="btn small ghost danger" onClick={() => removeSeries("next")} disabled={pending}>
              Excluir esta e as próximas
            </button>
            <button type="button" className="btn small ghost danger" onClick={() => removeSeries("all")} disabled={pending}>
              Excluir todas
            </button>
          </div>
        </div>
      )}
      <div className="segmented" role="group" aria-label="Tipo">
        {([
          ["expense", "Despesa"],
          ["income", "Receita"],
          ["transfer", "Acerto"],
        ] as const).map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={kind === v}
            onClick={() => {
              setKind(v);
              if (v === "transfer") {
                setSplitIds((s) => s.filter((x) => x !== payerId).slice(0, 1));
                setRepeat("once");
              }
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <label className="field">
        <span>{amountLabel}</span>
        <input
          className="input big num"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ""))}
          autoFocus={!initial}
          required
        />
      </label>

      <label className="field">
        <span>Descrição</span>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={kind === "transfer" ? "Acerto" : "Ex.: Mercado, conta de luz"}
          required={kind !== "transfer"}
          maxLength={200}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>{isSeries ? (repeat === "installment" ? "Data da compra" : "Primeiro mês") : "Data"}</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>{payerLabel}</span>
          <Select
            value={payerId}
            onChange={setPayerId}
            options={[...(kind !== "transfer" ? [{ value: "", label: "Ninguém ainda" }] : []), ...people.map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
            placeholder="Escolha"
          />
        </label>
      </div>

      {kind !== "transfer" &&
        (cards.length > 0 ? (
          <label className="field">
            <span>Cartão de crédito</span>
            <Select
              value={cardId}
              onChange={(v) => {
                setCardId(v);
                const c = cards.find((x) => x.id === v);
                if (c?.holderId && people.some((p) => p.id === c.holderId)) setPayerId(c.holderId);
              }}
              options={[
                { value: "", label: "Não foi no cartão" },
                ...cards.map((c) => ({ value: c.id, label: c.name, color: c.color })),
              ]}
            />
            {cardHint && <span className="faint">{cardHint}</span>}
          </label>
        ) : (
          kind === "expense" && (
            <p className="faint card-cta">
              <CreditCard size={15} strokeWidth={1.7} aria-hidden /> Pagou no cartão de crédito?{" "}
              <Link href="/cartoes" className="pos">Cadastre o cartão</Link> para acompanhar a fatura.
            </p>
          )
        ))}

      {!initial && kind !== "transfer" && (
        <div className="field">
          <span className="label-text">Repetição</span>
          <div className="segmented" role="group" aria-label="Repetição">
            {([
              ["once", "Uma vez"],
              ["installment", "Parcelado"],
              ["monthly", "Todo mês"],
            ] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={repeat === v}
                onClick={() => {
                  if (v !== repeat) setCount(v === "monthly" ? "12" : "10");
                  setRepeat(v);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {isSeries && (
            <div className="series-count">
              <label className="field">
                <span>{repeat === "installment" ? "Número de parcelas" : "Por quantos meses"}</span>
                <input
                  className="input num"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={repeat === "installment" ? 48 : 60}
                  value={count}
                  onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  required
                />
              </label>
              {seriesHint && <p className="series-hint num">{seriesHint}</p>}
            </div>
          )}
        </div>
      )}

      {kind === "transfer" ? (
        <label className="field">
          <span>Para quem</span>
          <Select
            value={splitIds[0] ?? ""}
            onChange={(v) => setSplitIds(v ? [v] : [])}
            options={people.filter((p) => p.id !== payerId).map((p) => ({ value: p.id, label: p.name, color: p.color }))}
            placeholder="Escolha"
          />
          <span className="faint">Um acerto abate o que uma pessoa deve para a outra.</span>
        </label>
      ) : (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label-text" style={{ marginBottom: 6 }}>
            {kind === "income" ? "De quem é esse dinheiro" : "Dividir entre"}
          </legend>
          <div className="segmented" role="group" aria-label="Como dividir" style={{ marginBottom: 6 }}>
            <button type="button" aria-pressed={mode === "equal"} onClick={() => setMode("equal")}>Partes iguais</button>
            <button
              type="button"
              aria-pressed={mode === "custom"}
              onClick={() => {
                setMode("custom");
                setCustom((c) => {
                  const next = { ...c };
                  splitIds.forEach((id, i) => {
                    if (!next[id]) next[id] = centsToInput(equalParts[i] ?? 0);
                  });
                  return next;
                });
              }}
            >
              Valores diferentes
            </button>
          </div>
          {people.map((p, i) => {
            const on = splitIds.includes(p.id);
            const idx = splitIds.indexOf(p.id);
            return (
              <div key={p.id} className="split-row">
                <label className="check">
                  <input type="checkbox" checked={on} onChange={() => toggleSplit(p.id)} />
                  <Avatar name={p.name} color={p.color} size={26} />
                  <span>{p.name}</span>
                </label>
                {on &&
                  (mode === "equal" ? (
                    <span className="faint num" style={{ textAlign: "right" }}>{formatMoney(equalParts[idx] ?? 0, currency)}</span>
                  ) : (
                    <input
                      className="input num"
                      inputMode="decimal"
                      aria-label={`Parte de ${p.name}`}
                      value={custom[p.id] ?? ""}
                      onChange={(e) => setCustom((c) => ({ ...c, [p.id]: e.target.value.replace(/[^\d,.]/g, "") }))}
                      placeholder="0,00"
                      style={{ minHeight: 38, textAlign: "right" }}
                      data-index={i}
                    />
                  ))}
              </div>
            );
          })}
          {mode === "custom" && (
            <p className={`faint ${customSum !== cents ? "neg" : ""}`}>
              Soma das partes: {formatMoney(customSum, currency)} de {formatMoney(cents, currency)}
            </p>
          )}
          {isSeries && repeat === "installment" && n >= 2 && cents > 0 && splitIds.length > 1 && (
            <p className="faint num">
              Por parcela:{" "}
              {splitIds
                .map((id, i) => `${people.find((p) => p.id === id)?.name} ${formatMoney(splitEqually(sharesNow[i] ?? 0, n)[n - 1], currency)}`)
                .join(" · ")}
            </p>
          )}
        </fieldset>
      )}

      <div className="field-row">
        {kind !== "transfer" && (
          <label className="field">
            <span>Categoria</span>
            <Select
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: "", label: "Sem categoria" },
                ...lookups.categories.filter((c) => !c.archived || c.id === categoryId).map((c) => ({ value: c.id, label: c.name, color: c.color })),
              ]}
            />
          </label>
        )}
        <label className="field">
          <span>Status</span>
          <Select
            value={statusId}
            onChange={setStatusId}
            options={[
              { value: "", label: "Sem status" },
              ...lookups.statuses.filter((s) => !s.archived || s.id === statusId).map((s) => ({ value: s.id, label: s.name, color: s.color })),
            ]}
          />
        </label>
      </div>

      {lookups.projects.length > 0 && (
        <label className="field">
          <span>Projeto</span>
          <Select
            value={projectId}
            onChange={setProjectId}
            options={[
              { value: "", label: "Nenhum" },
              ...lookups.projects.filter((p) => !p.archived || p.id === projectId).map((p) => ({ value: p.id, label: p.name, color: p.color })),
            ]}
          />
        </label>
      )}

      <label className="field">
        <span>Observações</span>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Opcional" />
      </label>

      <div className="actions" style={{ justifyContent: "space-between" }}>
        {initial ? (
          <button type="button" className="btn ghost danger" onClick={remove} disabled={pending}>
            <Trash2 size={16} strokeWidth={1.6} /> Excluir
          </button>
        ) : (
          <span />
        )}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => router.back()} disabled={pending}>Cancelar</button>
          <button className="btn primary" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </form>
  );
}
