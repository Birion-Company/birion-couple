"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserCheck } from "lucide-react";
import { mergeContactIntoMember } from "@/app/actions/settings";
import { Select } from "./select";
import { toastResult } from "./toaster";

type Opt = { id: string; name: string };

/**
 * Alguém que era seu contato entrou no casal: passa tudo do contato para a pessoa com login.
 * No casal só há uma pessoa possível (o par), então o cartão já fala o nome dela e só pergunta qual contato era ela.
 */
export function MergeContact({ contacts, members }: { contacts: Opt[]; members: Opt[] }) {
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [member, setMember] = useState("");
  const [pending, start] = useTransition();
  if (contacts.length === 0 || members.length === 0) return null;
  const only = members.length === 1 ? members[0] : null;
  const first = (s: string) => s.split(" ")[0];
  const c = contacts.find((x) => x.id === contact);
  const m = only ?? members.find((x) => x.id === member);
  return (
    <section className="card section merge-contact" aria-labelledby="juntar">
      <h2 id="juntar">
        <UserCheck size={17} strokeWidth={1.9} aria-hidden /> {only ? `${first(only.name)} já estava nos seus contatos?` : "O seu par já estava nos seus contatos?"}
      </h2>
      <p className="faint">
        {only ? `Escolha qual contato era ${first(only.name)}: as contas desse contato passam para ${first(only.name)}` : "Passe as contas do contato para a pessoa com login"}{" "}
        (quem pagou, as partes e as contas que se repetem). O contato sai da sua lista, e {only ? first(only.name) : "a pessoa"} confirma os lançamentos em Para
        confirmar.
      </p>
      <div className="merge-fields">
        <label>
          {only ? `Qual contato era ${first(only.name)}?` : "Contato"}
          <Select
            value={contact}
            onChange={setContact}
            placeholder="Escolha o contato"
            ariaLabel={only ? `Qual contato era ${only.name}` : "Contato"}
            options={contacts.map((x) => ({ value: x.id, label: x.name }))}
          />
        </label>
        {!only && (
          <label>
            Passar para
            <Select
              value={member}
              onChange={setMember}
              placeholder="Escolha a pessoa"
              ariaLabel="Passar para"
              options={members.map((x) => ({ value: x.id, label: x.name }))}
            />
          </label>
        )}
      </div>
      <button
        type="button"
        className="btn primary"
        disabled={pending || !c || !m}
        onClick={() => {
          if (!c || !m) return;
          if (!confirm(`Passar tudo de “${c.name}” para ${m.name}? O contato ${c.name} some da sua lista.`)) return;
          start(async () => {
            const r = await mergeContactIntoMember(c.id, m.id);
            toastResult(r);
            if (r.ok) {
              setContact("");
              setMember("");
              router.refresh();
            }
          });
        }}
      >
        {m ? `Passar as contas para ${first(m.name)}` : "Passar as contas"}
      </button>
    </section>
  );
}
