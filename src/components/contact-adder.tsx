"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Send, UserPlus, Users, X } from "lucide-react";
import { addContact } from "@/app/actions/settings";
import { toastResult } from "./toaster";

export type NewContact = { id: string; name: string; color: string; archived: boolean };

/**
 * Botão "Pessoas" no canto do formulário: cadastrar um contato (sem login), convidar alguém
 * para o app ou ir para a lista de pessoas. Fica fora dos campos de "quem pagou" e "quem deveria
 * pagar", para não parecer que adicionar alguém é só para um deles. Quem é adicionado passa a
 * aparecer nas listas do formulário; aí é só escolher onde ele entra.
 */
export function PeopleMenu({ suggestions, canInvite, onAdd }: { suggestions: string[]; canInvite: boolean; onAdd: (p: NewContact) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const add = () =>
    start(async () => {
      const r = await addContact(name);
      toastResult(r.ok && r.person ? { ok: true, message: `${r.person.name} está nas listas. Escolha onde ele entra.` } : r);
      if (r.ok && r.person) {
        onAdd(r.person);
        setName("");
        setOpen(false);
      }
    });

  return (
    <div className="people-menu" ref={boxRef} data-tour="tx-people">
      <button type="button" className="btn ghost" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <Users size={16} strokeWidth={1.7} /> Pessoas
      </button>
      {open && (
        <div className="people-menu-panel" role="dialog" aria-label="Pessoas">
          <div className="people-menu-head">
            <strong>Pessoas</strong>
            <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="people-menu-sec">
            <p className="people-menu-title">
              <UserPlus size={15} strokeWidth={1.8} aria-hidden /> Cadastrar contato
            </p>
            <p className="faint">Sem login: só para dividir contas. Mesmo nome = mesma pessoa.</p>
            <div className="people-menu-add">
              <input
                className="input"
                autoFocus
                list={listId}
                value={name}
                maxLength={60}
                placeholder="Nome (ex.: Fulano)"
                aria-label="Nome do contato"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (name.trim()) add();
                  }
                }}
              />
              <datalist id={listId}>
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <button type="button" className="btn small primary" disabled={pending || !name.trim()} onClick={add}>
                Adicionar
              </button>
            </div>
          </div>
          {canInvite && (
            <Link className="people-menu-link" href="/ajustes/membros">
              <Send size={15} strokeWidth={1.8} aria-hidden />
              <span>
                <strong>Convidar para o app</strong>
                <span className="faint">Com login: vê e confirma o que envolve ele.</span>
              </span>
            </Link>
          )}
          <Link className="people-menu-link" href="/ajustes/pessoas">
            <Users size={15} strokeWidth={1.8} aria-hidden />
            <span>
              <strong>Ver todas as pessoas</strong>
              <span className="faint">Família e contatos, esconder ou convidar.</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
