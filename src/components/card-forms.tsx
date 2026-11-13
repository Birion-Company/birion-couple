"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteCard, saveCard, setCardArchived } from "@/app/actions/cards";
import { CARD_BRANDS, brandOf } from "@/lib/card-brands";
import { suggestDueDay } from "@/lib/cards";
import { Select } from "./select";
import { toastResult } from "./toaster";

export type CardData = {
  id: string;
  name: string;
  color: string;
  closingDay: number;
  dueDay: number;
  alertDays: number | null;
  archived: boolean;
  ownerId: string | null;
};

type Owner = { id: string; name: string };

const ALERTS = [
  { value: "none", label: "Não avisar" },
  { value: "0", label: "Só no dia" },
  { value: "1", label: "1 dia antes" },
  { value: "2", label: "2 dias antes" },
  { value: "3", label: "3 dias antes" },
  { value: "5", label: "5 dias antes" },
  { value: "7", label: "1 semana antes" },
];

function dayValue(v: string) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export function CardForm({
  card,
  onDone,
  owners,
  defaultOwner,
}: {
  card: CardData | null;
  onDone: () => void;
  /** Só para quem administra: de quem é o cartão. */
  owners?: Owner[];
  defaultOwner?: string | null;
}) {
  const [ownerId, setOwnerId] = useState(card?.ownerId ?? defaultOwner ?? owners?.[0]?.id ?? "");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(card?.name ?? "");
  const [closing, setClosing] = useState(card ? String(card.closingDay) : "");
  const [due, setDue] = useState(card ? String(card.dueDay) : "");
  // Enquanto a pessoa não mexer no vencimento, ele acompanha o fechamento.
  const [dueTouched, setDueTouched] = useState(!!card);
  const [alert, setAlert] = useState(card ? (card.alertDays === null ? "none" : String(card.alertDays)) : "3");
  const alertOptions = ALERTS.some((a) => a.value === alert) ? ALERTS : [...ALERTS, { value: alert, label: `${alert} dias antes` }];

  const onClosing = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 2);
    setClosing(clean);
    const d = dayValue(clean);
    if (!dueTouched && d) setDue(String(suggestDueDay(d)));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveCard(card?.id ?? null, {
        name,
        color: card?.color ?? brandOf(name)?.color ?? "#64748B",
        closingDay: dayValue(closing) ?? 0,
        dueDay: dayValue(due) ?? 0,
        alertDays: alert === "none" ? null : Number(alert),
        ownerId: owners ? ownerId || null : undefined,
      });
      toastResult(r);
      if (r.ok) {
        onDone();
        router.refresh();
      }
    });
  };

  const fieldId = card?.id ?? "novo";
  return (
    <form className="form card-form" onSubmit={submit}>
      {owners && (
        <label className="field">
          <span>De quem é o cartão</span>
          <Select value={ownerId} onChange={setOwnerId} options={owners.map((o) => ({ value: o.id, label: o.name }))} placeholder="Escolha" />
        </label>
      )}
      {/* O cartão vem de uma lista pronta (com pesquisa); depois de cadastrado o nome não muda. */}
      {!card && (
        <div className="field">
          <span id="cartao-lista">Cartão</span>
          <Select
            value={name}
            onChange={setName}
            options={CARD_BRANDS.map((b) => ({ value: b.name, label: b.name, color: b.color }))}
            placeholder="Escolha o cartão"
            ariaLabel="Cartão"
            searchable
          />
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label htmlFor={`fecha-${fieldId}`}>Dia de fechamento da fatura</label>
          <input
            id={`fecha-${fieldId}`}
            className="input num"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={closing}
            onChange={(e) => onClosing(e.target.value)}
            placeholder="Ex.: 15"
            aria-describedby={`fecha-hint-${fieldId}`}
            required
          />
          <span id={`fecha-hint-${fieldId}`} className="faint">Compras a partir desse dia já vão para a fatura seguinte.</span>
        </div>
        <div className="field">
          <label htmlFor={`vence-${fieldId}`}>Dia de vencimento</label>
          <input
            id={`vence-${fieldId}`}
            className="input num"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={due}
            onChange={(e) => {
              setDueTouched(true);
              setDue(e.target.value.replace(/\D/g, "").slice(0, 2));
            }}
            placeholder="Ex.: 22"
            aria-describedby={`vence-hint-${fieldId}`}
            required
          />
          <span id={`vence-hint-${fieldId}`} className="faint">
            {dueTouched ? "Se for antes do fechamento, vence no mês seguinte." : "Preenchido com uma semana depois do fechamento. Confira na sua fatura."}
          </span>
        </div>
      </div>
      <label className="field">
        <span>Avisar antes do fechamento e do vencimento</span>
        <Select value={alert} onChange={setAlert} options={alertOptions} />
      </label>
      <div className="actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onDone} disabled={pending}>
          Cancelar
        </button>
        <button className="btn primary" disabled={pending || (!card && !brandOf(name))}>
          {pending ? "Salvando…" : card ? "Salvar" : "Cadastrar cartão"}
        </button>
      </div>
    </form>
  );
}

/** Botão "Novo cartão" que abre o formulário no lugar (desativado quando não cabe mais cartão). */
export function NewCard({
  startOpen,
  owners,
  defaultOwner,
  blocked,
}: {
  startOpen: boolean;
  owners?: Owner[];
  defaultOwner?: string | null;
  blocked?: string | null;
}) {
  const [open, setOpen] = useState(startOpen && !blocked);
  if (blocked) {
    return (
      <div className="new-card-blocked">
        <button type="button" className="btn primary" disabled aria-describedby="novo-cartao-motivo">
          <Plus size={16} /> Novo cartão
        </button>
        <span id="novo-cartao-motivo" className="faint">{blocked}</span>
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Novo cartão
      </button>
    );
  }
  return (
    <section className="card section" aria-label="Novo cartão">
      <h2 style={{ marginBottom: 12 }}>Novo cartão</h2>
      <CardForm card={null} onDone={() => setOpen(false)} owners={owners} defaultOwner={defaultOwner} />
    </section>
  );
}

/** Painel de um cartão: o lápis troca o conteúdo pelo formulário de edição (com arquivar e excluir). */
export function CardPanel({
  card,
  header,
  children,
  owners,
}: {
  card: CardData;
  header: React.ReactNode;
  children: React.ReactNode;
  owners?: Owner[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      toastResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <section className="card section credit-card-panel" aria-label={`Cartão ${card.name}`} style={{ borderTop: `4px solid ${card.color}` }}>
      <div className="credit-card-head">
        {header}
        {!editing && (
          <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label={`Editar ${card.name}`} title="Editar cartão">
            <Pencil size={16} strokeWidth={1.7} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="card-edit">
          <CardForm card={card} onDone={() => setEditing(false)} owners={owners} />
          <div className="actions card-danger">
            <button type="button" className="btn small ghost" disabled={pending} onClick={() => run(() => setCardArchived(card.id, true))}>
              <Archive size={15} strokeWidth={1.7} /> Arquivar
            </button>
            <button
              type="button"
              className="btn small ghost danger"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Excluir o cartão ${card.name}? Os lançamentos continuam, só deixam de estar ligados a ele.`)) run(() => deleteCard(card.id));
              }}
            >
              <Trash2 size={15} strokeWidth={1.7} /> Excluir cartão
            </button>
          </div>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function ArchivedCard({ card }: { card: CardData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      toastResult(r);
      if (r.ok) router.refresh();
    });
  return (
    <div className="row">
      <span className="card-chip small" style={{ background: card.color }} aria-hidden />
      <p className="grow title">{card.name}</p>
      <button type="button" className="btn small ghost" disabled={pending} onClick={() => run(() => setCardArchived(card.id, false))}>
        <ArchiveRestore size={15} strokeWidth={1.7} /> Reativar
      </button>
      <button
        type="button"
        className="btn small ghost danger"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Excluir o cartão ${card.name}? Os lançamentos continuam.`)) run(() => deleteCard(card.id));
        }}
      >
        Excluir
      </button>
    </div>
  );
}
