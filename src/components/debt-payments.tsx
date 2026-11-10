"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, TrendingUp, Undo2 } from "lucide-react";
import { deleteTransactions, payDebt, setTransactionsSettled } from "@/app/actions/transactions";
import { centsToInput, formatMoney, parseAmountToCents } from "@/lib/money";
import { toast, toastResult } from "./toaster";

type Split = {
  participantId: string;
  amountCents: number;
  paidById: string | null;
  paidCents: number | null;
  partCents?: number;
  partials?: { id: string; cents: number; pending: boolean }[];
  pendingPayId?: string | null;
};

/** Valor de uma parte. Se já pagou uma parte dela: o valor original riscado e, ao lado, o que falta. */
export function OwedAmount({ cents, partCents = 0, currency }: { cents: number; partCents?: number; currency: string }) {
  if (!partCents) return <>{formatMoney(cents, currency)}</>;
  return (
    <>
      <s className="was" title={`Já pagou ${formatMoney(partCents, currency)}`}>
        {formatMoney(cents, currency)}
      </s>{" "}
      <strong>{formatMoney(cents - partCents, currency)}</strong>
    </>
  );
}

/**
 * Selo de um pagamento de dívida: lucro (pagou a mais) ou o que falta (pagou a menos: o resto
 * continua devido no mesmo lançamento).
 */
export function ProfitBadge({ paidCents, owedCents, restCents = 0, currency }: { paidCents: number; owedCents: number; restCents?: number; currency: string }) {
  if (restCents > 0) {
    return (
      <span className="rest-badge" title={`Devia ${formatMoney(owedCents, currency)} e pagou ${formatMoney(paidCents, currency)}`}>
        falta {formatMoney(restCents, currency)}
      </span>
    );
  }
  const diff = paidCents - owedCents;
  // Pagar menos não é desconto: o resto continua devido (aparece como "falta").
  if (diff <= 0) return null;
  return (
    <span className="profit-badge" title={`Devia ${formatMoney(owedCents, currency)} e pagou ${formatMoney(paidCents, currency)}`}>
      <TrendingUp size={12} strokeWidth={2.4} aria-hidden /> +{formatMoney(diff, currency)} de lucro
    </span>
  );
}

/** Uma parte em aberto: botão "Marcar como pago" que pergunta quanto foi pago de verdade. */
export function PayButton({ txId, participantId, owedCents, currency, label = "Marcar como pago" }: { txId: string; participantId: string; owedCents: number; currency: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(centsToInput(owedCents));
  const cents = parseAmountToCents(value, ",") ?? 0;
  const diff = cents - owedCents;
  if (!open) {
    return (
      <button type="button" className="btn small ghost" data-tour="debts-settle" onClick={() => setOpen(true)}>
        <Check size={14} strokeWidth={2} /> {label}
      </button>
    );
  }
  // Não é um <form>: este botão também aparece dentro do formulário do lançamento, e um formulário
  // dentro do outro fazia o "Confirmar" salvar o lançamento (e fechar) em vez de registrar o pagamento.
  const confirm = () => {
    if (cents <= 0) return toast("Digite quanto foi pago.", "error");
    start(async () => {
      const r = await payDebt({ transactionId: txId, participantId, amountCents: cents });
      toastResult(r);
      if (r.ok) {
        setOpen(false);
        router.refresh();
        window.dispatchEvent(new Event("bf:tx-changed"));
      }
    });
  };
  return (
    <div className="pay-form" role="group" aria-label="Registrar pagamento">
      <label className="pay-field">
        <span>Quanto pagou</span>
        <input
          className="input"
          inputMode="decimal"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d,.]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              confirm();
            }
          }}
          aria-label="Quanto pagou"
        />
      </label>
      <span className={`pay-diff ${diff > 0 ? "pos" : diff < 0 ? "neg" : "faint"}`}>
        {diff > 0 ? `+${formatMoney(diff, currency)} de lucro` : diff < 0 && cents > 0 ? `Ainda vai faltar ${formatMoney(-diff, currency)}` : cents > 0 ? "quita a dívida" : ""}
      </span>
      <button type="button" className="btn small primary" disabled={pending} onClick={confirm}>Confirmar</button>
      <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>Cancelar</button>
    </div>
  );
}

/** Desfaz o "pago" antigo (marcado sem valor): a dívida volta. */
function UnsettleButton({ txId }: { txId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn small ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setTransactionsSettled([txId], false);
          toastResult(r);
          if (r.ok) {
            router.refresh();
            window.dispatchEvent(new Event("bf:tx-changed"));
          }
        })
      }
    >
      <Undo2 size={14} strokeWidth={2} /> Desfazer
    </button>
  );
}

/** Desfaz um pagamento: apaga o acerto e a dívida volta. */
export function UndoButton({ payId }: { payId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn small ghost"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Desfazer este pagamento? A dívida volta.")) return;
        start(async () => {
          const r = await deleteTransactions([payId]);
          toastResult(r.ok ? { ok: true, message: "Pagamento desfeito: a dívida voltou." } : r);
          if (r.ok) {
            router.refresh();
            window.dispatchEvent(new Event("bf:tx-changed"));
          }
        });
      }}
    >
      <Undo2 size={14} strokeWidth={2} /> Desfazer
    </button>
  );
}

/**
 * Quem deve neste lançamento e quem já pagou (com o valor pago e o lucro ou desconto).
 * Só para lançamentos com quem pagou; acertos entre pessoas não têm dívida própria.
 */
export function DebtPayments({
  tx,
  names,
  me,
  currency,
  canPay,
}: {
  tx: { id: string; kind: string; payerId: string | null; settled: boolean; splits: Split[] };
  names: Record<string, string>;
  me: string | null;
  currency: string;
  canPay: boolean;
}) {
  if (!tx.payerId || tx.kind === "transfer") return null;
  const owed = tx.splits.filter((s) => s.participantId !== tx.payerId && s.amountCents > 0);
  if (owed.length === 0) return null;
  const who = (id: string) => (id === me ? "Você" : names[id] ?? "Alguém");
  const income = tx.kind === "income";
  const creditor = (s: Split) => (income ? who(s.participantId) : who(tx.payerId!)).replace(/^Você$/, "você");
  return (
    <div className="debt-payments">
      {owed.map((s) => (
        <div key={s.participantId} className="debt-pay-row">
          {s.paidById ? (
            <>
              <p className="grow">
                <Check size={14} strokeWidth={2.4} className="pos" aria-hidden />{" "}
                {income ? (
                  <>{who(tx.payerId!)} repassou {formatMoney(s.paidCents ?? s.amountCents, currency)} para {who(s.participantId).replace(/^Você$/, "você")}</>
                ) : (
                  <>{who(s.participantId)} pagou {formatMoney(s.paidCents ?? s.amountCents, currency)} para {creditor(s)}</>
                )}
                {s.paidCents !== null && <> <ProfitBadge paidCents={s.paidCents} owedCents={s.amountCents} currency={currency} /></>}
              </p>
              <Link className="btn small ghost" href={`/transacoes/${s.paidById}`}>Ver acerto</Link>
              {canPay && <UndoButton payId={s.paidById} />}
            </>
          ) : s.pendingPayId ? (
            <>
              <p className="grow">
                {who(s.participantId)} deve <OwedAmount cents={s.amountCents} partCents={s.partCents} currency={currency} /> para {creditor(s)}
                <span className="faint"> · pagamento registrado, esperando confirmação</span>
              </p>
              <Link className="btn small ghost" href={`/transacoes/${s.pendingPayId}`}>Ver pagamento</Link>
            </>
          ) : (
            <>
              <p className="grow">
                {income ? (
                  <>{who(tx.payerId!)} deve repassar <OwedAmount cents={s.amountCents} partCents={s.partCents} currency={currency} /> para {who(s.participantId).replace(/^Você$/, "você")}</>
                ) : (
                  <>{who(s.participantId)} deve <OwedAmount cents={s.amountCents} partCents={s.partCents} currency={currency} /> para {creditor(s)}</>
                )}
                {(s.partials ?? []).filter((x) => !x.pending).map((x) => (
                  <span key={x.id} className="faint" style={{ display: "block" }}>
                    Já pagou {formatMoney(x.cents, currency)}{canPay ? " · " : ""}
                    {canPay && <UndoButton payId={x.id} />}
                  </span>
                ))}
                {tx.settled && <span className="faint"> · já marcado como pago</span>}
              </p>
              {canPay && !tx.settled && (
                <PayButton
                  txId={tx.id}
                  participantId={s.participantId}
                  owedCents={s.amountCents - (s.partCents ?? 0)}
                  currency={currency}
                  // Mesmo nome de Dívidas: quem recebe vê "Recebi"; quem deve vê "Paguei".
                  label={(income ? tx.payerId : s.participantId) === me ? "Paguei" : (income ? s.participantId : tx.payerId) === me ? "Recebi" : "Pago"}
                />
              )}
              {canPay && tx.settled && <UnsettleButton txId={tx.id} />}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
