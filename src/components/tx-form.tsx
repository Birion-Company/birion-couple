"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CreditCard, Lock, Repeat, Trash2 } from "lucide-react";
import { deleteSeries, deleteTransactions, saveTransaction } from "@/app/actions/transactions";
import { addMonthsIso, monthLabel, seriesLabel } from "@/lib/cards";
import { describeImpact } from "@/lib/impact";
import { centsToInput, formatMoney, parseAmountToCents, splitEqually } from "@/lib/money";
import type { Lookups, TxRow } from "@/lib/queries";
import { Select } from "./select";
import { toast, toastResult } from "./toaster";
import { ImpactBox } from "./impact-box";
import { Avatar } from "./ui";

type Kind = "expense" | "income" | "loan" | "transfer";
type Repeat = "once" | "installment" | "monthly";

/** O que cada tipo significa, mostrado embaixo da escolha. */
const KIND_HELP: Record<Kind, string> = {
  expense: "Algo que foi pago. Se dividir com outras pessoas, cada uma passa a dever a parte dela para quem pagou.",
  income: "Dinheiro que entrou (salário, venda, estorno). Se dividir, quem recebeu fica devendo a parte de cada um.",
  loan: "Dinheiro emprestado ou algo pago só para outra pessoa. Quem pegou emprestado fica devendo o valor todo.",
  transfer: "Pagamento de uma dívida entre pessoas da família. Abate o que uma deve para a outra.",
};

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
  readOnly = false,
  createdByName,
}: {
  lookups: Lookups;
  currency: string;
  initial: TxRow | null;
  prefill?: TxPrefill;
  defaultStatusId: string | null;
  me: string | null;
  /** Lançamento de outra pessoa: só para ver. */
  readOnly?: boolean;
  createdByName?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const people = lookups.participants.filter(
    (p) => !p.archived || p.id === initial?.payerId || initial?.splits.some((s) => s.participantId === p.id),
  );
  const firstPerson = me && people.some((p) => p.id === me) ? me : people[0]?.id ?? "";

  const [kind, setKind] = useState<Kind>(initial?.kind ?? prefill?.kind ?? "expense");
  // Empréstimo e acerto são de uma pessoa para outra: sem categoria, cartão nem repetição.
  const between = kind === "transfer" || kind === "loan";
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
      (prefill?.kind === "transfer" || prefill?.kind === "loan" ? lookups.statuses.find((s) => s.behavior === "open" && !s.archived)?.id : undefined) ??
      defaultStatusId ??
      "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const cards = lookups.cards.filter((c) => !c.archived || c.id === initial?.cardId);
  const [cardId, setCardId] = useState(initial?.cardId ?? "");
  const [repeat, setRepeat] = useState<Repeat>("once");
  const [count, setCount] = useState("10");
  // "Todo mês": por padrão repete sem data para acabar.
  const [forever, setForever] = useState(true);
  const [applyToSeries, setApplyToSeries] = useState(true);
  // Cada pessoa tem os próprios cartões: só aparecem os de quem pagou.
  const payerCards = cards.filter((c) => !c.ownerId || c.ownerId === payerId || c.id === initial?.cardId);
  const card = payerCards.find((c) => c.id === cardId) ?? null;
  const payerName = people.find((p) => p.id === payerId)?.name;
  const n = Math.min(Math.max(Number(count) || 0, 0), repeat === "installment" ? 48 : 60);
  const isSeries = !initial && !between && repeat !== "once";
  const isForever = isSeries && repeat === "monthly" && forever;

  const initialSplitIds =
    initial?.splits.map((s) => s.participantId) ??
    (prefill?.toId ? [prefill.toId] : prefill?.kind === "loan" ? [] : people.filter((p) => !p.archived).map((p) => p.id));
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
    if (between && splitIds.length !== 1) return toast(kind === "loan" ? "Escolha quem pegou emprestado." : "Escolha para quem foi o acerto.", "error");
    if (between && !payerId) return toast(kind === "loan" ? "Escolha quem emprestou." : "Escolha quem pagou o acerto.", "error");
    if (mode === "custom" && !between && customSum !== cents) {
      return toast(`As partes somam ${formatMoney(customSum, currency)}, mas o total é ${formatMoney(cents, currency)}.`, "error");
    }
    if (isSeries && !isForever && (n < 2 || String(n) !== count.trim())) {
      return toast(repeat === "installment" ? "Escolha de 2 a 48 parcelas." : "Escolha de 2 a 60 meses.", "error");
    }
    start(async () => {
      const r = await saveTransaction(initial?.id ?? null, {
        date,
        description: description || (kind === "transfer" ? "Acerto" : kind === "loan" ? "Empréstimo" : ""),
        amountCents: cents,
        kind,
        payerId: payerId || null,
        categoryId: between ? null : categoryId || null,
        projectId: projectId || null,
        statusId: statusId || null,
        cardId: between ? null : cardId || null,
        notes,
        series: isSeries ? { kind: repeat as "installment" | "monthly", count: isForever ? null : n } : null,
        applyToSeries: initial?.seriesId ? applyToSeries : undefined,
        splitMode: mode === "custom" && !between ? "custom" : "equal",
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
    const monthly = initial.seriesKind === "monthly";
    const question =
      scope === "all"
        ? monthly
          ? "Excluir todos os meses deste lançamento e parar de repetir?"
          : "Excluir todas as parcelas desta compra?"
        : monthly
          ? "Excluir este mês e os próximos e parar de repetir?"
          : "Excluir esta parcela e as próximas?";
    if (!window.confirm(question)) return;
    start(async () => {
      const r = await deleteSeries(initial.id, scope);
      toastResult(r);
      if (r.ok) {
        router.push("/transacoes");
        router.refresh();
      }
    });
  };

  const payerLabel =
    kind === "income" ? "Quem recebeu" : kind === "transfer" ? "Quem pagou o acerto" : kind === "loan" ? "Quem emprestou" : "Quem pagou";
  const amountLabel = isSeries ? (repeat === "installment" ? "Valor total da compra" : "Valor por mês") : "Valor";
  const seriesWord = initial?.seriesKind === "monthly" ? "lançamento recorrente" : "compra parcelada";
  const endless = initial?.seriesKind === "monthly" && !initial.seriesTotal;

  // Resumo das parcelas.
  let seriesHint: string | null = null;
  if (isForever && cents > 0) {
    seriesHint = `${formatMoney(cents, currency)} todo mês a partir de ${monthLabel(date.slice(0, 7))}, até você parar`;
  } else if (isSeries && !isForever && n >= 2 && cents > 0) {
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

  // O que este lançamento muda em cada parte do app (mesmas regras do cálculo de verdade).
  const statusBehavior = (lookups.statuses.find((x) => x.id === statusId)?.behavior ?? null) as "pending" | "open" | "settled" | null;
  const impact =
    cents > 0
      ? describeImpact({
          kind,
          amountCents: cents,
          payerId: payerId || null,
          shares: between
            ? splitIds.slice(0, 1).map((id) => ({ participantId: id, cents }))
            : splitIds.map((id, i) => ({ participantId: id, cents: sharesNow[i] ?? 0 })),
          me,
          names: Object.fromEntries(people.map((p) => [p.id, p.name])),
          statusBehavior,
          card: card && !between ? { name: card.name, closingDay: card.closingDay, dueDay: card.dueDay } : null,
          date,
          repeat: isSeries ? repeat : "once",
          count: isSeries ? (isForever ? null : n) : null,
          categoryName: lookups.categories.find((c) => c.id === categoryId)?.name ?? null,
          currency,
          today: today(),
        })
      : null;

  return (
    <form className="form" onSubmit={submit}>
      {readOnly && (
        <div className="notice readonly-notice" role="note">
          <Lock size={15} strokeWidth={1.8} aria-hidden /> Lançado por {createdByName ?? "outra pessoa"}. Você pode ver, mas só quem lançou (ou quem
          administra a família) pode alterar ou excluir.
        </div>
      )}
      {initial?.seriesId && !readOnly && (
        <div className="series-notice">
          <p className="series-notice-title">
            <Repeat size={16} strokeWidth={1.8} aria-hidden />
            {endless
              ? `Lançamento que se repete todo mês (${initial.seriesIndex}º mês)`
              : `${seriesLabel(initial.seriesKind, initial.seriesIndex, initial.seriesTotal)} de uma ${seriesWord}`}
          </p>
          <label className="check">
            <input type="checkbox" checked={applyToSeries} onChange={(e) => setApplyToSeries(e.target.checked)} />
            <span>
              Levar descrição, categoria, projeto, cartão, quem pagou e observações para {endless ? "os outros meses (inclusive os próximos)" : "as outras parcelas"}
            </span>
          </label>
          <p className="faint">Valor, data, divisão e status mudam só nesta.</p>
          <div className="actions">
            <button type="button" className="btn small ghost danger" onClick={() => removeSeries("next")} disabled={pending}>
              {endless ? "Parar de repetir a partir deste mês" : "Excluir esta e as próximas"}
            </button>
            <button type="button" className="btn small ghost danger" onClick={() => removeSeries("all")} disabled={pending}>
              Excluir todas
            </button>
          </div>
        </div>
      )}
      <fieldset className="tx-fieldset" disabled={readOnly}>
      <div className="tx-cols">
        <div className="tx-col" role="group" aria-label="O lançamento">
          <div className="segmented" role="group" aria-label="Tipo" data-tour="tx-kind">
            {([
              ["expense", "Despesa"],
              ["income", "Receita"],
              ["loan", "Empréstimo"],
              ["transfer", "Acerto"],
            ] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={kind === v}
                onClick={() => {
                  setKind(v);
                  if (v === "transfer" || v === "loan") {
                    setSplitIds((s) => s.filter((x) => x !== payerId).slice(0, 1));
                    setRepeat("once");
                  }
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="kind-help">{KIND_HELP[kind]}</p>

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
              placeholder={kind === "transfer" ? "Acerto" : kind === "loan" ? "Empréstimo" : "Ex.: Mercado, conta de luz"}
              required={!between}
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
                onChange={(v) => {
                  setPayerId(v);
                  // Cartão de outra pessoa não vale para o novo pagador.
                  const c = cards.find((x) => x.id === cardId);
                  if (c?.ownerId && c.ownerId !== v) setCardId("");
                }}
                options={[...(!between ? [{ value: "", label: "Ninguém ainda" }] : []), ...people.map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
                placeholder="Escolha"
              />
            </label>
          </div>

          {!between &&
            (payerCards.length > 0 ? (
              <label className="field" data-tour="tx-card">
                <span>{payerName && payerId !== me ? `Cartão de crédito de ${payerName}` : "Cartão de crédito"}</span>
                <Select
                  value={cardId}
                  onChange={setCardId}
                  options={[
                    { value: "", label: "Não foi no cartão" },
                    ...payerCards.map((c) => ({ value: c.id, label: c.name, color: c.color })),
                  ]}
                />
              </label>
            ) : (
              kind === "expense" && !readOnly && (
                <p className="faint card-cta" data-tour="tx-card">
                  <CreditCard size={15} strokeWidth={1.7} aria-hidden />
                  {payerId && payerId !== me ? (
                    <>{payerName ?? "Essa pessoa"} não tem cartão cadastrado.</>
                  ) : (
                    <>
                      Pagou no cartão de crédito? <Link href="/cartoes" className="pos">Cadastre o seu cartão</Link> para acompanhar a fatura.
                    </>
                  )}
                </p>
              )
            ))}

          {!initial && !between && (
            <div className="field" data-tour="tx-repeat">
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
              {isSeries && repeat === "monthly" && (
                <div className="segmented" role="group" aria-label="Até quando" style={{ marginTop: 8 }}>
                  <button type="button" aria-pressed={forever} onClick={() => setForever(true)}>
                    Sem data para acabar
                  </button>
                  <button type="button" aria-pressed={!forever} onClick={() => setForever(false)}>
                    Por alguns meses
                  </button>
                </div>
              )}
              {isForever && seriesHint && <p className="series-hint num" style={{ paddingBottom: 0, marginTop: 8 }}>{seriesHint}</p>}
              {isSeries && !isForever && (
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

        </div>
        <div className="tx-col" role="group" aria-label="Divisão e detalhes">
          {between ? (
            <div className="field">
              <span className="label-text" id="destino-label">{kind === "loan" ? "Quem pegou emprestado" : "Para quem"}</span>
              <Select
                value={splitIds[0] ?? ""}
                onChange={(v) => setSplitIds(v ? [v] : [])}
                options={people.filter((p) => p.id !== payerId).map((p) => ({ value: p.id, label: p.name, color: p.color }))}
                placeholder="Escolha"
                ariaLabel={kind === "loan" ? "Quem pegou emprestado" : "Para quem"}
              />
              <span className="faint">
                {kind === "loan"
                  ? "Use para dinheiro emprestado ou algo que você pagou só para outra pessoa."
                  : "Um acerto abate o que uma pessoa deve para a outra."}
              </span>
            </div>
          ) : (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }} data-tour="tx-split">
              <legend className="label-text" style={{ marginBottom: 6 }}>
                {kind === "income" ? "De quem é esse dinheiro" : "Quem deveria pagar"}
              </legend>
              <span className="faint" style={{ marginTop: -2, marginBottom: 6, display: "block" }}>
                {kind === "income"
                  ? "Marque de quem é a receita; quem recebeu fica devendo a parte de cada um."
                  : "Marque só uma pessoa se a conta é toda dela, ou várias para dividir. Quem pagou recebe a parte dos outros."}
              </span>
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
            </fieldset>
          )}

          <div className="field-row">
            {!between && (
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

          <ImpactBox impact={impact} />

        </div>
      </div>

      </fieldset>

      {readOnly ? (
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => router.back()}>Voltar</button>
        </div>
      ) : (
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
      )}
    </form>
  );
}
