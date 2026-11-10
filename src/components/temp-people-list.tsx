"use client";

import { useTransition } from "react";
import { UserCheck } from "lucide-react";
import { makePersonPermanent } from "@/app/actions/settings";
import { toastResult } from "./toaster";
import { Avatar } from "./ui";

/**
 * Pessoas avulsas: só a explicação e a lista. Elas são criadas na hora de lançar
 * (botão "Pessoa avulsa" no lançamento), não aqui.
 */
export function TempPeopleList({ people }: { people: { id: string; name: string; color: string; archived: boolean; avatarUrl?: string | null }[] }) {
  const [pending, start] = useTransition();
  return (
    <section className="card section" aria-labelledby="avulsas">
      <h2 id="avulsas" style={{ marginBottom: 4 }}>Pessoas avulsas</h2>
      <p className="faint">
        Para quem não é da família, como Fulano. Crie ao lançar, em <strong>Pessoa avulsa</strong>. Some quando acertar tudo.
      </p>
      {people.length > 0 && (
        <div className="rows" style={{ marginTop: 8 }}>
          {people.map((p) => (
            <div key={p.id} className="row" style={{ opacity: p.archived ? 0.6 : 1 }}>
              <Avatar name={p.name} color={p.color} src={p.avatarUrl} />
              <div className="grow">
                <p className="title">{p.name}</p>
                <p className="sub">{p.archived ? "acertou tudo · fora das listas" : "em aberto · aparece em Dívidas"}</p>
              </div>
              <button
                type="button"
                className="btn small ghost"
                disabled={pending}
                onClick={() => start(async () => toastResult(await makePersonPermanent(p.id)))}
                title="Passa a ser uma pessoa da família, nas listas de sempre"
              >
                <UserCheck size={15} /> Tornar da família
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
