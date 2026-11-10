"use client";

import { useId, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { addTempPerson } from "@/app/actions/settings";
import { toastResult } from "./toaster";

export type TempPerson = { id: string; name: string; color: string; archived: boolean; temporary: boolean };

/**
 * "+ Pessoa avulsa": alguém só para este lançamento (ex.: emprestei para o Fulano), sem cadastrar na família.
 * Digitar um nome que já existe usa a mesma pessoa (não cria outro Fulano).
 */
export function TempPersonAdder({ suggestions, onAdd }: { suggestions: string[]; onAdd: (p: TempPerson) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const listId = useId();
  const add = () =>
    start(async () => {
      const r = await addTempPerson(name);
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
        <UserPlus size={15} /> Pessoa avulsa (só para este lançamento)
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
        aria-label="Nome da pessoa avulsa"
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
      <p className="faint temp-person-hint">
        Some sozinha quando acertar tudo. Mesmo nome = mesma pessoa.
      </p>
    </div>
  );
}
