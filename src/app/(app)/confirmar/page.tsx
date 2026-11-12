import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { ApprovalBadge, ApprovalButtons } from "@/components/approval";
import { Avatar, Money, formatDate } from "@/components/ui";
import { roleSentence } from "@/lib/approval-text";
import { requireAuth } from "@/lib/auth";
import { seriesLabel } from "@/lib/cards";
import { getApprovalInbox, getLookups, getLookupsFor, type ApprovalItem } from "@/lib/queries";
import { ApprovalInbox, type InboxCard } from "@/components/approval-inbox";
import { KINDS } from "@/lib/defaults";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Para confirmar" };

/**
 * "Para confirmar": o que outras pessoas colocaram no seu nome. Só depois de aceito o lançamento
 * vale nas dívidas. Embaixo, o que você lançou e está esperando alguém.
 */
export default async function ConfirmPage() {
  const auth = await requireAuth();
  const [inbox, lookups, all] = await Promise.all([getApprovalInbox(auth), getLookupsFor(auth), getLookups(auth.householdId, auth.userId)]);
  const people = new Map(lookups.participants.map((p) => [p.id, p]));
  const name = (id: string | null) => (id === auth.participantId ? "você" : (id && people.get(id)?.name) || "alguém");
  const me = auth.participantId;
  const cur = auth.currency;

  const what = ({ tx, count }: ApprovalItem) => {
    const series = tx.seriesId ? (tx.seriesKind === "monthly" ? (tx.seriesTotal ? `${tx.seriesTotal} meses` : "todo mês") : `${count > 1 ? count : tx.seriesTotal ?? count} parcelas`) : null;
    return (
      <p className="sub">
        {formatDate(tx.date, { day: "2-digit", month: "short", year: "numeric" })}
        {series ? ` · ${series}` : ""}
        {tx.seriesId && tx.seriesKind === "installment" ? ` · a partir da ${seriesLabel(tx.seriesKind, tx.seriesIndex, tx.seriesTotal)}` : ""}
      </p>
    );
  };
  const creator = (tx: ApprovalItem["tx"]) => {
    const p = tx.approval?.creatorId ? people.get(tx.approval.creatorId) : null;
    return p ? <Avatar name={p.name} color={p.color} size={34} src={p.avatarUrl} /> : <Avatar name="?" color="#94A3B8" size={34} />;
  };

  // Cartão de quem lançou (nome do cartão, para saber em qual fatura caiu).
  const cardName = new Map(all.cards.map((c) => [c.id, c.name]));
  const catName = new Map(lookups.categories.map((c) => [c.id, c.name]));
  const toCard = (it: ApprovalItem): InboxCard => {
    const tx = it.tx;
    const p = tx.approval?.creatorId ? people.get(tx.approval.creatorId) : null;
    const series = tx.seriesId
      ? tx.seriesKind === "monthly"
        ? tx.seriesTotal
          ? `${tx.seriesTotal} meses`
          : "todo mês"
        : `${tx.seriesTotal ?? it.count} parcelas (a partir da ${seriesLabel(tx.seriesKind, tx.seriesIndex, tx.seriesTotal)})`
      : null;
    const split = tx.splits.filter((s) => s.amountCents > 0);
    const facts = [
      { label: "Tipo", value: KINDS.find((k) => k.value === tx.kind)?.label ?? tx.kind },
      { label: "Data", value: formatDate(tx.date, { day: "2-digit", month: "short", year: "numeric" }) },
      { label: "Quem pagou", value: tx.payerId ? name(tx.payerId).replace(/^./, (c) => c.toUpperCase()) : "ninguém ainda" },
      tx.cardId ? { label: "Como foi pago", value: `Cartão ${cardName.get(tx.cardId) ?? ""}`.trim() } : null,
      tx.kind === "expense" && split.length > 0
        ? { label: "Divisão", value: split.map((s) => `${name(s.participantId)} ${formatMoney(s.amountCents, cur)}`).join(" · ") }
        : null,
      tx.categoryId ? { label: "Categoria", value: catName.get(tx.categoryId) ?? "—" } : null,
      series ? { label: "Repete", value: series } : null,
      tx.notes ? { label: "Observação", value: tx.notes } : null,
    ].filter((x): x is { label: string; value: string } => !!x);
    return {
      id: tx.id,
      series: !!tx.seriesId,
      creator: { name: p?.name ?? "Alguém", color: p?.color ?? "#94A3B8", avatarUrl: p?.avatarUrl ?? null },
      description: tx.description,
      total: formatMoney(tx.amountCents, cur),
      role: roleSentence(tx, me!, name, cur),
      facts,
    };
  };

  const empty = inbox.toMe.length + inbox.refusedByMe.length + inbox.fromMe.length === 0;
  return (
    <div className="confirm-page">
      <div className="page-head">
        <div>
          <h1>Para confirmar</h1>
          <p className="muted">O que outras pessoas colocaram no seu nome. Só vale nas dívidas depois que você aceita.</p>
        </div>
      </div>

      {empty && (
        <div className="card section" data-tour="confirm-list">
          <p className="debts-empty">
            <CheckCircle2 size={18} strokeWidth={1.7} aria-hidden /> Nada para confirmar.
          </p>
          <p className="faint" style={{ marginTop: 6 }}>
            Quando alguém da família lançar algo com você (uma conta dividida, uma dívida, um pagamento), aparece aqui para aceitar ou recusar.
          </p>
        </div>
      )}

      {inbox.toMe.length > 0 && (
        <section className="card section" aria-labelledby="esperando-voce" data-tour="confirm-list">
          <div className="card-head">
            <h2 id="esperando-voce">Esperando você</h2>
            <span className="faint num">{inbox.toMe.length}</span>
          </div>
          <ApprovalInbox items={inbox.toMe.map(toCard)} />
        </section>
      )}

      {inbox.refusedByMe.length > 0 && (
        <section className="card section" aria-labelledby="voce-recusou">
          <div className="card-head">
            <h2 id="voce-recusou">Você recusou</h2>
            <span className="faint">não vale nas dívidas</span>
          </div>
          <div className="rows">
            {inbox.refusedByMe.map((it) => (
              <div key={it.tx.id} className="row approval-row">
                {creator(it.tx)}
                <div className="grow" style={{ minWidth: 0 }}>
                  <p className="title">
                    <Link href={`/transacoes/${it.tx.id}`}>{it.tx.description}</Link> · <Money cents={it.tx.amountCents} currency={cur} />
                  </p>
                  <p className="sub">
                    {roleSentence(it.tx, me!, name, cur)}
                    {it.tx.approval?.refused.find((r) => r.id === me)?.reason ? ` · seu motivo: ${it.tx.approval.refused.find((r) => r.id === me)!.reason}` : ""}
                  </p>
                </div>
                <ApprovalButtons txId={it.tx.id} refused />
              </div>
            ))}
          </div>
        </section>
      )}

      {inbox.fromMe.length > 0 && (
        <section className="card section" aria-labelledby="voce-lancou">
          <div className="card-head">
            <h2 id="voce-lancou">Você lançou</h2>
            <span className="faint">esperando os outros</span>
          </div>
          <div className="rows">
            {inbox.fromMe.map((it) => (
              <Link key={it.tx.id} href={`/transacoes/${it.tx.id}`} className="row approval-row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <p className="title">
                    {it.tx.description} · <Money cents={it.tx.amountCents} currency={cur} />{" "}
                    <ApprovalBadge approval={it.tx.approval} me={me} names={Object.fromEntries(lookups.participants.map((p) => [p.id, p.name]))} />
                  </p>
                  {it.tx.approval?.refused.map((r) => (
                    <p key={r.id} className="sub neg">
                      {name(r.id)} recusou{r.reason ? `: “${r.reason}”` : ""}. Corrija o lançamento (ele volta a pedir confirmação) ou exclua.
                    </p>
                  ))}
                  {what(it)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
