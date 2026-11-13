"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAutoRule, deleteAutoRule } from "@/app/actions/auto-accept";
import {
  generatePurchaseKey,
  revokePurchaseKey,
} from "@/app/actions/purchase-key";
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
  purchaseKey,
}: {
  rules: Rule[];
  people: { value: string; label: string }[];
  currency: string;
  purchaseKey: { prefix: string; lastUsedAt: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(people[0]?.value ?? "");
  const [max, setMax] = useState("");
  const [match, setMatch] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
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
    <>
      <section className="card section" aria-labelledby="automacao">
        <h2 id="automacao">Aceite automático</h2>
        <p className="faint">
          Para usar menos o app: o que alguém lançar no seu nome e bater com uma
          regra entra como <strong>aceito</strong>, sem passar por Para
          confirmar. Você ainda recebe o aviso, fica no histórico como
          &quot;aceito pela regra&quot; e pode recusar depois. O que não bater
          com nenhuma regra continua pedindo seu aceite, com um aviso no
          celular.
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
      <section
        className="card section"
        aria-labelledby="compras"
        style={{ marginTop: 16 }}
      >
        <h2 id="compras">Compras do cartão (automático)</h2>
        <p className="faint">
          Uma porta para lançar compras do seu cartão sem abrir o app: um leitor
          de notificações do banco ou uma integração futura envia a compra e ela
          entra no cartão certo, com a categoria das suas regras e a divisão que
          a família já usa nesse lugar. A chave é pessoal e só lança no{" "}
          <strong>seu</strong> cartão.
        </p>
        {fresh && (
          <div className="callout">
            <p>
              <strong>Copie agora, ela não aparece de novo:</strong>
            </p>
            <code className="mono" style={{ wordBreak: "break-all" }}>
              {fresh}
            </code>
            <pre
              className="mono"
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                marginTop: 8,
              }}
            >{`curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/compra \
  -H "Authorization: Bearer ${fresh}" -H "Content-Type: application/json" \
  -d '{"description":"UBER *TRIP","amount":"45,90","card":"Nubank"}'`}</pre>
          </div>
        )}
        {purchaseKey && !fresh && (
          <p className="sub">
            Chave ativa: {purchaseKey.prefix}…{" "}
            {purchaseKey.lastUsedAt
              ? `· último uso em ${new Date(purchaseKey.lastUsedAt).toLocaleString("pt-BR")}`
              : "· ainda não usada"}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await generatePurchaseKey();
                if (r.ok) {
                  setFresh(r.key);
                  router.refresh();
                } else toastResult({ ok: false, error: r.error } as never);
              })
            }
          >
            {purchaseKey ? "Gerar nova chave" : "Gerar chave"}
          </button>
          {purchaseKey && (
            <button
              className="btn ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await revokePurchaseKey();
                  setFresh(null);
                  router.refresh();
                })
              }
            >
              Desativar
            </button>
          )}
        </div>
      </section>
    </>
  );
}
