"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAutoRule, deleteAutoRule } from "@/app/actions/auto-accept";
import { formatMoney } from "@/lib/money";
import { Select } from "./select";
import { toastResult } from "./toaster";

type Rule = {
  id: string;
  from: string;
  maxCents: number | null;
  match: string | null;
};

export function AutoAcceptEditor({
  rules,
  people,
  currency,
}: {
  rules: Rule[];
  people: { value: string; label: string }[];
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(people[0]?.value ?? "");
  const [max, setMax] = useState("");
  const [match, setMatch] = useState("");
  const run = (fn: () => Promise<{ ok: boolean }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      toastResult(res as never);
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  return (
    <section className="card section" aria-labelledby="automacao">
      <h2 id="automacao">Aceite automático</h2>
      <p className="faint">
        Para usar menos o app: o que alguém lançar no seu nome e bater com uma
        regra entra como <strong>aceito</strong>, sem passar por Para confirmar.
        Você ainda recebe o aviso, fica no histórico como &quot;aceito pela
        regra&quot; e pode recusar depois. O que não bater com nenhuma regra
        continua pedindo seu aceite, com um aviso no celular.
      </p>
      <div className="rows">
        {rules.map((r) => (
          <div key={r.id} className="row bud-row">
            <p className="grow title">
              Aceitar o que {r.from} lançar
              {r.maxCents !== null
                ? `, até ${formatMoney(r.maxCents, currency)} na sua parte`
                : ""}
              {r.match ? `, com "${r.match}" na descrição` : ""}
            </p>
            <button
              className="btn small ghost"
              disabled={pending}
              aria-label={`Apagar regra de ${r.from}`}
              onClick={() => run(() => deleteAutoRule(r.id))}
            >
              Apagar
            </button>
          </div>
        ))}
        {rules.length === 0 && <p className="faint">Nenhuma regra ainda.</p>}
      </div>
      {people.length === 0 ? (
        <p className="faint">
          Quando outra pessoa entrar na família, você poderá criar regras para
          ela.
        </p>
      ) : (
        <form
          className="goal-new"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createAutoRule(from, max, match),
              () => {
                setMax("");
                setMatch("");
              },
            );
          }}
        >
          <h3>Nova regra</h3>
          <div className="field">
            <span>Aceitar o que esta pessoa lançar</span>
            <Select
              value={from}
              onChange={setFrom}
              options={people}
              ariaLabel="Pessoa da regra"
            />
          </div>
          <label className="field">
            <span>Até quanto na sua parte (opcional)</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="Sem limite"
              value={max}
              onChange={(e) => setMax(e.target.value.replace(/[^\d,.]/g, ""))}
            />
          </label>
          <label className="field">
            <span>Só se a descrição tiver (opcional)</span>
            <input
              className="input"
              value={match}
              maxLength={60}
              placeholder="aluguel, mercado…"
              onChange={(e) => setMatch(e.target.value)}
            />
          </label>
          <button className="btn" disabled={pending}>
            Criar regra
          </button>
        </form>
      )}
    </section>
  );
}
