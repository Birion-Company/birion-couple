"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserCheck } from "lucide-react";
import { mergeContactIntoMember } from "@/app/actions/settings";
import { toastResult } from "./toaster";

type Opt = { id: string; name: string };

/**
 * Alguém que era seu contato entrou na família: passa tudo do contato para a pessoa com login.
 */
export function MergeContact({ contacts, members }: { contacts: Opt[]; members: Opt[] }) {
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [member, setMember] = useState("");
  const [pending, start] = useTransition();
  if (contacts.length === 0 || members.length === 0) return null;
  const c = contacts.find((x) => x.id === contact);
  const m = members.find((x) => x.id === member);
  return (
    <section className="card section merge-contact" aria-labelledby="juntar">
      <h2 id="juntar">
        <UserCheck size={17} strokeWidth={1.9} aria-hidden /> Um contato seu entrou na família?
      </h2>
      <p className="faint">
        Passe as contas dele para a pessoa com login: quem pagou, as partes e as contas que se repetem. O contato sai da sua lista, e a pessoa confirma
        os lançamentos em Para confirmar.
      </p>
      <div className="merge-fields">
        <label>
          Contato
          <select className="select" value={contact} onChange={(e) => setContact(e.target.value)}>
            <option value="">Escolha…</option>
            {contacts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Agora é
          <select className="select" value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="">Escolha…</option>
            {members.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
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
        Passar as contas
      </button>
    </section>
  );
}
