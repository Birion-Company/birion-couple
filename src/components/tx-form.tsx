"use client";

import { STATE_INFO, stateLabel, txState } from "@/lib/tx-state";
import { DebtPayments } from "./debt-payments";
import { SettlesBadge } from "./tx-row";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, CreditCard, Lock, Repeat, Trash2 } from "lucide-react";
import { deleteSeries, deleteTransactions, saveTransaction } from "@/app/actions/transactions";
import { addMonthsIso, invoiceDates, invoiceOf, monthLabel, shortDate } from "@/lib/cards";
import { describeImpact } from "@/lib/impact";
import { centsToInput, formatMoney, parseAmountToCents, splitEqually } from "@/lib/money";
import type { Lookups, TxRow } from "@/lib/queries";
import { Select } from "./select";
import { toast, toastResult } from "./toaster";
import { ImpactBox } from "./impact-box";
import { Avatar } from "./ui";
import { PeopleMenu, type NewContact } from "./contact-adder";
import { PeoplePicker, type PickPerson } from "./people-picker";
import { ApprovalButtons } from "./approval";
import { roleSentence } from "@/lib/approval-text";

type Kind = "expense" | "income" | "loan" | "transfer";
type Repeat = "once" | "installment" | "monthly";

/** O que cada tipo significa, mostrado embaixo da escolha. */
const KIND_HELP: Record<Kind, string> = {
  expense: "Algo pago. Quem tem parte fica devendo para quem pagou.",
  income: "Dinheiro que entrou: salário, venda, estorno.",
  loan: "Alguém fica te devendo. Ex.: um empréstimo para Fulano.",
  transfer: "Pagamento entre pessoas. Abate a dívida.",
};

export type TxPrefill = Partial<Pick<TxRow, "kind" | "payerId" | "amountCents" | "description">> & { toId?: string };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Para confirmar" dentro do lançamento: aceitar/recusar, ou quem ainda falta aceitar. */
function ApprovalNotice({ tx, me, names, currency }: { tx: TxRow; me: string | null; names: Record<string, string>; currency: string }) {
  const a = tx.approval!;
  const name = (id: string | null) => (id === me ? "você" : (id && names[id]) || "alguém");
  const creator = name(a.creatorId);
  const myRefusal = a.refused.find((r) => r.id === me);
  if (me && a.waiting.includes(me)) {
    return (
      <div className="notice approval-notice" role="note">
        <p>
          <strong>{creator.replace(/^./, (c) => c.toUpperCase())}</strong> colocou isso no seu nome: {roleSentence(tx, me, name, currency)}.
          <span className="faint"> Só vale nas dívidas depois que você aceitar.</span>
        </p>
        <ApprovalButtons txId={tx.id} series={!!tx.seriesId} />
      </div>
    );
  }
  if (myRefusal) {
    return (
      <div className="notice approval-notice refused" role="note">
        <p>
          Você recusou{myRefusal.reason ? `: “${myRefusal.reason}”` : ""}. Não vale nas dívidas.
        </p>
        <ApprovalButtons txId={tx.id} refused />
      </div>
    );
  }
  return (
    <div className={`notice approval-notice ${a.refused.length ? "refused" : ""}`} role="note">
      {a.refused.map((r) => (
        <p key={r.id}>
          <strong>{name(r.id).replace(/^./, (c) => c.toUpperCase())}</strong> recusou{r.reason ? `: “${r.reason}”` : ""}. Corrija (volta a pedir confirmação) ou exclua.
        </p>
      ))}
      {a.waiting.length > 0 && (
        <p>
          Esperando <strong>{a.waiting.map(name).join(", ")}</strong> aceitar. Até lá, não mexe nas dívidas.
        </p>
      )}
    </div>
  );
}

/** Dois lados de um lançamento com a seta de para onde o dinheiro vai (no celular, um embaixo do outro). */
function PeopleFlow({ left, right, caption, direction }: { kind: Kind; left: React.ReactNode; right: React.ReactNode; caption: string; direction: "left" | "right" | "none" }) {
  return (
    <div className={`flow flow-${direction}`}>
      <div className="flow-side">{left}</div>
      <div className="flow-arrow">
        {direction !== "none" && <ArrowRight size={20} strokeWidth={2} aria-hidden />}
        {caption && <span>{caption}</span>}
      </div>
      <div className="flow-side">{right}</div>
    </div>
  );
}

export function TxForm({
  lookups,
  currency,
  initial,
  prefill,
  me,
  canInvite = false,
  readOnly = false,
  createdByName,
  returnTo,
  onDone,
}: {
  lookups: Lookups;
  currency: string;
  initial: TxRow | null;
  prefill?: TxPrefill;
  me: string | null;
  /** Pode convidar gente para o app (quem administra a família). */
  canInvite?: boolean;
  /** Lançamento de outra pessoa: só para ver. */
  readOnly?: boolean;
  createdByName?: string | null;
  /** Para onde voltar depois de salvar ou excluir (ex.: "/identificar"). */
  returnTo?: string;
  /** Aberto numa janela (popup): ao salvar, excluir ou cancelar, fecha a janela em vez de mudar de página. */
  onDone?: () => void;
}) {
  const leave = (to: string) => {
    if (onDone) onDone();
    else router.push(to);
    router.refresh();
  };
  const router = useRouter();
  const [pending, start] = useTransition();
  // Pessoas: membros (com login) + contatos ativos, mais quem está neste lançamento ou acabou de ser adicionado.
  const [extra, setExtra] = useState<NewContact[]>([]);
  const inThisTx = new Set(
    [initial?.payerId, ...(initial?.splits.map((s) => s.participantId) ?? []), prefill?.payerId, prefill?.toId, ...extra.map((x) => x.id)].filter(Boolean) as string[],
  );
  const shown = (p: { id: string; archived: boolean }) => !p.archived || inThisTx.has(p.id);
  // Membros primeiro (na ordem da família); depois os contatos usados por último.
  const members = lookups.participants.filter((p) => p.hasLogin && shown(p));
  const contacts = [
    ...lookups.participants.filter((p) => !p.hasLogin && shown(p)).sort((a, b) => (b.lastUsed ?? "").localeCompare(a.lastUsed ?? "")),
    ...extra.filter((x) => !lookups.participants.some((p) => p.id === x.id && shown(p))),
  ];
  const people = [...members, ...contacts];
  // Nomes de todos os contatos (inclusive escondidos) para o "Adicionar pessoa" sugerir.
  const contactNames = lookups.participants.filter((p) => !p.hasLogin).map((p) => p.name);
  const firstPerson = me && people.some((p) => p.id === me) ? me : people[0]?.id ?? "";

  const [kind, setKind] = useState<Kind>(initial?.kind ?? prefill?.kind ?? "expense");
  // Receita antiga lançada no nome de outra pessoa continua editável; as novas são sempre de quem lança.
  const incomeIsMine = !initial || initial.kind !== "income" || initial.payerId === me;
  // Empréstimo e acerto são de uma pessoa para outra: sem categoria, cartão nem repetição.
  const between = kind === "transfer" || kind === "loan";
  const [amount, setAmount] = useState(
    initial ? centsToInput(initial.amountCents) : prefill?.amountCents ? centsToInput(prefill.amountCents) : "",
  );
  const [description, setDescription] = useState(initial?.description ?? prefill?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [payerId, setPayerId] = useState(initial?.payerId ?? (prefill?.kind === "income" ? me : null) ?? prefill?.payerId ?? firstPerson);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const cards = lookups.cards.filter((c) => !c.archived || c.id === initial?.cardId);
  const [cardId, setCardId] = useState(initial?.cardId ?? "");
  const [repeat, setRepeat] = useState<Repeat>("once");
  const [count, setCount] = useState("10");
  // "Todo mês": por padrão repete sem data para acabar.
  const [forever, setForever] = useState(true);
  const [applyToSeries, setApplyToSeries] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Cartões que esta pessoa vê (os próprios; quem administra vê todos). No cartão, quem pagou é o dono.
  const visibleCards = cards.filter((c) => !c.archived || c.id === cardId);
  const card = cards.find((c) => c.id === cardId) ?? null;
  // Em qual fatura a compra entra pela data: "fatura de dezembro", que fecha e vence quando.
  const bill = (() => {
    if (!card || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const { closing, due } = invoiceDates(invoiceOf(date, card.closingDay), card);
    const name = new Date(Number(due.slice(0, 4)), Number(due.slice(5, 7)) - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
    const year = due.slice(0, 4) !== date.slice(0, 4) ? ` de ${due.slice(0, 4)}` : "";
    return { label: `fatura de ${name}${year}`, closing, due };
  })();
  // Cartão só em despesa: receita é dinheiro que entra (vai para você, não para um cartão).
  const showMethod = kind === "expense" && (visibleCards.length > 0 || !!card);
  const payerFromCard = kind === "expense" && !!card?.ownerId;
  const payerName = people.find((p) => p.id === payerId)?.name;
  const cardLabel = (c: { name: string; ownerId: string | null }) =>
    c.ownerId && c.ownerId !== me ? `Cartão ${c.name} (de ${people.find((p) => p.id === c.ownerId)?.name ?? "outra pessoa"})` : `Cartão ${c.name}`;
  const n = Math.min(Math.max(Number(count) || 0, 0), repeat === "installment" ? 48 : 60);
  // Empréstimo também pode ser parcelado ("emprestei 5.600, ele paga em 10x"); acerto não.
  const canRepeat = !initial && kind !== "transfer";
  const isSeries = canRepeat && repeat !== "once" && !(kind === "loan" && repeat === "monthly");
  const isForever = isSeries && repeat === "monthly" && forever;

  const initialSplitIds =
    initial?.splits.map((s) => s.participantId) ??
    // Novo lançamento: só você marcado (a conta é sua até você marcar mais alguém).
    (prefill?.toId ? [prefill.toId] : prefill?.kind === "loan" ? [] : firstPerson ? [firstPerson] : []);
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cents <= 0) return toast("Digite um valor maior que zero.", "error");
    if (between && splitIds.length !== 1) return toast(kind === "loan" ? "Escolha quem deve." : "Escolha para quem foi o acerto.", "error");
    if (!payerId) return toast(kind === "loan" ? "Escolha quem vai receber." : kind === "transfer" ? "Escolha quem pagou o acerto." : kind === "income" ? "Escolha quem recebeu." : "Escolha quem pagou.", "error");
    if (mode === "custom" && !between && customSum !== cents) {
      return toast(customSum < cents ? `Falta dividir ${formatMoney(cents - customSum, currency)} entre as pessoas.` : `As partes passam ${formatMoney(customSum - cents, currency)} do total.`, "error");
    }
    if (isSeries && !isForever && (n < 2 || String(n) !== count.trim())) {
      return toast(repeat === "installment" ? "Escolha de 2 a 48 parcelas." : "Escolha de 2 a 60 meses.", "error");
    }
    start(async () => {
      const r = await saveTransaction(initial?.id ?? null, {
        date,
        description: description || (kind === "transfer" ? "Acerto" : kind === "loan" ? "Dívida" : ""),
        amountCents: cents,
        kind,
        payerId: payerId || null,
        // Só despesa tem categoria.
        categoryId: kind === "expense" ? categoryId || null : null,
        projectId: projectId || null,
        cardId: kind === "expense" ? cardId || null : null,
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
        leave(returnTo ?? (initial ? "/transacoes" : "/painel"));
      }
    });
  };

  const remove = () => {
    if (!initial || !window.confirm(initial.seriesId ? "Excluir só esta?" : "Excluir este lançamento?")) return;
    start(async () => {
      const r = await deleteTransactions([initial.id]);
      toastResult(r);
      if (r.ok) {
        leave(returnTo ?? "/transacoes");
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
        leave(returnTo ?? "/transacoes");
      }
    });
  };

  // ---------- Quem paga e quem deve, lado a lado com uma seta ----------
  const pick: PickPerson[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    avatarUrl: "avatarUrl" in p ? (p.avatarUrl as string | null) : null,
    hasLogin: "hasLogin" in p ? !!p.hasLogin : false,
  }));
  const one = (label: string, value: string, onPick: (id: string) => void, list = pick, tour?: string) => (
    <div className="field" data-tour={tour}>
      <span className="label-text">{label}</span>
      <PeoplePicker people={list} value={value ? [value] : []} onChange={(ids) => onPick(ids[0] ?? "")} ariaLabel={label} me={me} disabled={readOnly} />
    </div>
  );
  const onlyPayer = splitIds.length > 0 && splitIds.every((id) => id === payerId);
  let leftSide: React.ReactNode;
  let rightSide: React.ReactNode;
  let flowCaption = "";
  // Para onde o dinheiro vai ter que ir: "left" = da direita para a esquerda.
  let flowDirection: "left" | "right" | "none" = "none";
  if (kind === "expense") {
    leftSide = (
      <>
        {showMethod && (
          <label className="field" data-tour="tx-card">
            <span>Como foi pago</span>
            <Select
              value={cardId}
              onChange={(v) => {
                setCardId(v);
                // No cartão, quem pagou é sempre o dono dele: a fatura é dele.
                const c = cards.find((x) => x.id === v);
                if (c?.ownerId) setPayerId(c.ownerId);
              }}
              options={[
                { value: "", label: "Sem cartão (Pix, dinheiro…)" },
                ...visibleCards.map((c) => ({ value: c.id, label: cardLabel(c), color: c.color })),
              ]}
            />
          </label>
        )}
        {!payerFromCard && one("Quem pagou", payerId, setPayerId, pick, "tx-payer")}
      </>
    );
    rightSide = (
      <div className="field" data-tour="tx-split">
        <span className="label-text">Quem deveria pagar</span>
        <PeoplePicker people={pick} value={splitIds} onChange={setSplitIds} multiple ariaLabel="Quem deveria pagar" me={me} disabled={readOnly} />
      </div>
    );
    flowCaption = splitIds.length === 0 ? "" : onlyPayer ? "conta só de quem pagou" : "recebe a parte de";
    flowDirection = splitIds.length === 0 || onlyPayer ? "none" : "left";
  } else if (kind === "income") {
    leftSide = incomeIsMine && me ? (
      <div className="field">
        <span className="label-text">Quem recebeu</span>
        <p className="flow-fixed">
          <Avatar name={people.find((p) => p.id === me)?.name ?? "Você"} color={people.find((p) => p.id === me)?.color ?? "#94A3B8"} size={22} /> Você
        </p>
      </div>
    ) : (
      one("Quem recebeu", payerId, setPayerId)
    );
    rightSide = (
      <div className="field" data-tour="tx-split">
        <span className="label-text">De quem é esse dinheiro</span>
        <PeoplePicker people={pick} value={splitIds} onChange={setSplitIds} multiple ariaLabel="De quem é esse dinheiro" me={me} disabled={readOnly} />
      </div>
    );
    flowCaption = splitIds.length === 0 ? "" : onlyPayer ? "é todo seu" : "repassa a parte para";
    flowDirection = splitIds.length === 0 || onlyPayer ? "none" : "right";
  } else {
    const loan = kind === "loan";
    leftSide = one(loan ? "Quem vai receber" : "Quem pagou o acerto", payerId, setPayerId, pick, "tx-payer");
    rightSide = one(
      loan ? "Quem deve" : "Para quem",
      splitIds[0] ?? "",
      (v) => setSplitIds(v ? [v] : []),
      pick.filter((p) => p.id !== payerId),
      "tx-split",
    );
    flowCaption = loan ? "vai receber de" : "pagou para";
    flowDirection = loan ? "left" : "right";
  }

  const amountLabel = isSeries ? (repeat === "installment" ? (kind === "loan" ? "Valor total da dívida" : "Valor total da compra") : "Valor por mês") : "Valor";
  const monthly = initial?.seriesKind === "monthly";
  const endless = monthly && !initial?.seriesTotal;

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
  // Quem já pagou a própria parte (com um acerto ligado) continua pago enquanto estiver na divisão.
  const paidBy = new Map((initial?.splits ?? []).map((x) => [x.participantId, x.paidById]));
  const settled = initial?.settled ?? false;
  const state = txState({
    kind,
    payerId: payerId || null,
    cardId: kind === "expense" ? cardId || null : null,
    invoicePaid: !!initial?.invoicePaid && initial.cardId === cardId,
    settled,
    splits: between
      ? splitIds.slice(0, 1).map((id) => ({ participantId: id, amountCents: 1, paidById: paidBy.get(id) }))
      : splitIds.map((id, i) => ({ participantId: id, amountCents: sharesNow[i] ?? 1, paidById: paidBy.get(id) })),
  });
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
          settled: settled || (state === "paid" && !card),
          card: card && !between ? { name: card.name, closingDay: card.closingDay, dueDay: card.dueDay } : null,
          date,
          repeat: isSeries ? repeat : "once",
          count: isSeries ? (isForever ? null : n) : null,
          categoryName: kind === "expense" ? lookups.categories.find((c) => c.id === categoryId)?.name ?? null : null,
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
      {initial?.approval && <ApprovalNotice tx={initial} me={me} names={Object.fromEntries(lookups.participants.map((p) => [p.id, p.name]))} currency={currency} />}
      <fieldset className="tx-fieldset" disabled={readOnly}>
      <div className="tx-cols">
        <div className="tx-col" role="group" aria-label="O lançamento">
          <div className="segmented" role="group" aria-label="Tipo" data-tour="tx-kind">
            {([
              ["expense", "Despesa"],
              ["income", "Receita"],
              ["loan", "Dívida"],
              ["transfer", "Acerto"],
            ] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={kind === v}
                onClick={() => {
                  setKind(v);
                  // Receita é dinheiro que entrou para você: não dá para lançar entrada no nome de outra pessoa.
                  if (v === "income" && me && incomeIsMine) setPayerId(me);
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
              placeholder={kind === "transfer" ? "Acerto" : kind === "loan" ? "Ex.: Notebook" : "Ex.: Mercado, conta de luz"}
              required={!between}
              maxLength={200}
            />
          </label>

          <label className="field">
            <span>{isSeries ? (repeat === "installment" ? "Data da compra" : "Primeiro mês") : "Data"}</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>

          <ImpactBox impact={impact} />

          {canRepeat && (
            <div className="field" data-tour="tx-repeat">
              <span className="label-text">{kind === "loan" ? "Como vai te pagar" : "Repetição"}</span>
              <div className="segmented" role="group" aria-label="Repetição">
                {(kind === "loan"
                  ? ([
                      ["once", "De uma vez"],
                      ["installment", "Parcelado"],
                    ] as const)
                  : ([
                      ["once", "Uma vez"],
                      ["installment", "Parcelado"],
                      ["monthly", "Todo mês"],
                    ] as const)
                ).map(([v, l]) => (
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
          <PeopleFlow
            kind={kind}
            left={leftSide}
            right={rightSide}
            caption={flowCaption}
            direction={flowDirection}
          />
          {payerFromCard && card && (
            <p className="faint card-paid-hint">
              <CreditCard size={15} strokeWidth={1.7} aria-hidden />
              <span>
                {repeat === "installment" ? "A 1ª parcela entra" : "Entra"} na {card.ownerId === me ? "sua " : ""}
                <strong className="bill-name">{bill?.label}</strong> do {card.name}
                {card.ownerId !== me ? ` de ${payerName ?? "outra pessoa"}` : ""}.
                {bill && <span className="card-paid-dates">Fecha {shortDate(bill.closing)} · vence {shortDate(bill.due)}.</span>}
              </span>
            </p>
          )}
          {!between && kind === "expense" && visibleCards.length === 0 && !readOnly && (
            <p className="faint card-cta">
              <CreditCard size={15} strokeWidth={1.7} aria-hidden />
              Usa cartão? <Link href="/cartoes" className="pos">Cadastre o seu cartão</Link>.
            </p>
          )}
          {!between && splitIds.length > 0 && (
            <div className="field split-amounts">
              <div className="segmented" role="group" aria-label="Como dividir">
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
              {splitIds.map((id, idx) => {
                const p = people.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <div key={id} className="split-row">
                    <span className="check">
                      <Avatar name={p.name} color={p.color} size={24} src={"avatarUrl" in p ? (p.avatarUrl as string | null) : null} />
                      <span>{p.id === me ? "Você" : p.name}</span>
                    </span>
                    {mode === "equal" ? (
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
                      />
                    )}
                  </div>
                );
              })}
              {mode === "custom" && (
                <p className={`faint ${customSum !== cents ? "neg" : ""}`}>
                  {customSum === cents
                    ? `Tudo dividido: ${formatMoney(cents, currency)}`
                    : customSum < cents
                      ? `Falta dividir ${formatMoney(cents - customSum, currency)} de ${formatMoney(cents, currency)}`
                      : `Passou ${formatMoney(customSum - cents, currency)} do total de ${formatMoney(cents, currency)}`}
                </p>
              )}
            </div>
          )}

          <div className="field-row">
            {kind === "expense" && (
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
          </div>

          <div className="field tx-state" data-tour="tx-state">
            <span className="label-text">Status</span>
            <p className="tx-state-line">
              <span className="status-dot" style={{ background: STATE_INFO[state].color, borderColor: STATE_INFO[state].color }} aria-hidden />
              <strong>{stateLabel(state, kind)}</strong>
              <span className="faint">· automático</span>
            </p>
            <p className="faint tx-state-help">{STATE_INFO[state].help}</p>
            {initial?.settles && (
              <p className="tx-settles">
                Pagamento da dívida em <Link href={`/transacoes/${initial.settles.txId}`} className="pos">{initial.settles.description}</Link>, que era de{" "}
                {formatMoney(initial.settles.owedCents, currency)}.{" "}
                <SettlesBadge tx={{ ...initial, amountCents: cents || initial.amountCents }} currency={currency} />
                <span className="faint" style={{ display: "block" }}>Mude se o valor pago foi outro.</span>
              </p>
            )}
            {initial && initial.kind !== "transfer" && (
              <DebtPayments
                tx={initial}
                names={Object.fromEntries(people.map((p) => [p.id, p.name]))}
                me={me}
                currency={currency}
                canPay={!readOnly || initial.payerId === me || initial.splits.some((x) => x.participantId === me)}
              />
            )}
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


        </div>
      </div>

      </fieldset>

      {readOnly ? (
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => (onDone ? onDone() : router.back())}>Voltar</button>
        </div>
      ) : (
      <>
      {initial?.seriesId && (
        <label className="check series-apply">
          <input type="checkbox" checked={applyToSeries} onChange={(e) => setApplyToSeries(e.target.checked)} />
          <span>
            Levar descrição, categoria, projeto, cartão, quem pagou e observações para {monthly ? "os outros meses" : "as outras parcelas"}
            <span className="faint"> (valor, data e divisão mudam só nesta)</span>
          </span>
        </label>
      )}
      <div className="actions" style={{ justifyContent: "space-between" }}>
        {/* Canto inferior esquerdo: cadastrar ou convidar pessoas (vale para qualquer campo de pessoa). */}
        <div className="actions">
        <PeopleMenu suggestions={contactNames} canInvite={canInvite} onAdd={(p) => setExtra((x) => [...x.filter((y) => y.id !== p.id), p])} />
        {initial ? (
          <div className="delete-wrap">
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => (initial.seriesId ? setDeleteOpen((o) => !o) : remove())}
              disabled={pending}
              aria-expanded={initial.seriesId ? deleteOpen : undefined}
            >
              <Trash2 size={16} strokeWidth={1.6} /> Excluir
            </button>
            {deleteOpen && initial.seriesId && (
              <div className="delete-menu" role="group" aria-label="O que excluir">
                <button type="button" className="btn small ghost danger" onClick={remove} disabled={pending}>
                  {monthly ? "Só este mês" : "Só esta parcela"}
                </button>
                {/* Parcelas não "param no meio": apagar daqui para frente deixaria a 1/3 sem as outras. Só o que é todo mês para. */}
                {monthly && (
                  <button type="button" className="btn small ghost danger" onClick={() => removeSeries("next")} disabled={pending}>
                    {endless ? "Parar de repetir a partir deste mês" : "Este e os próximos"}
                  </button>
                )}
                <button type="button" className="btn small ghost danger" onClick={() => removeSeries("all")} disabled={pending}>
                  {monthly ? "Todos os meses" : "Todas as parcelas"}
                </button>
                <button type="button" className="btn small ghost" onClick={() => setDeleteOpen(false)}>
                  Cancelar
                </button>
              </div>
            )}
          </div>
        ) : null}
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => (onDone ? onDone() : router.back())} disabled={pending}>Cancelar</button>
          <button className="btn primary" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
      </>
      )}
    </form>
  );
}
