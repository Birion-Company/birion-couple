"use client";

import { useId, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { addContact } from "@/app/actions/settings";
import { toastResult } from "./toaster";

export type NewContact = { id: string; name: string; color: string; archived: boolean };

/**
 * "Adicionar pessoa" no lançamento: digite o nome. Se já existe (mesmo escondida), usa a mesma pessoa;
 * se não, cria um contato (pessoa sem login).
 */
export function ContactAdder({ suggestions, onAdd }: { suggestions: string[]; onAdd: (p: NewContact) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const listId = useId();
  const add = () =>
    start(async () => {
      const r = await addContact(name);
      toastResult(r);
      if (r.ok && r.person) {
        onAdd(r.person);
        setName("");
        setOpen(false);
      }
    });
  if (!open) {
    return (
      <button type="button" className="btn small ghost temp-person-btn" onClick={() => setOpen(true)}>
        <UserPlus size={15} /> Adicionar pessoa
      </button>
    );
  }
  return (
    <div className="temp-person">
      <input
        className="input"
        autoFocus
        list={listId}
        value={name}
        maxLength={60}
        placeholder="Nome (ex.: Fulano)"
        aria-label="Nome da pessoa"
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
      <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>
        Cancelar
      </button>
      <p className="faint temp-person-hint">Mesmo nome = mesma pessoa. Sem login, não entra no app.</p>
    </div>
  );
}
