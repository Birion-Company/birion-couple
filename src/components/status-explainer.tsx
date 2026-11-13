import { STATE_INFO, type TxState } from "@/lib/tx-state";

/** Onde cada status entra nas contas. Mesmas regras de lib/tx-state.ts, lib/balances.ts e do painel. */
const ROWS: { state: TxState; when: string; debts: string }[] = [
  { state: "on-card", when: "Cartão com a fatura em aberto.", debts: "Quem tem parte deve ao dono" },
  { state: "to-settle", when: "Alguém ainda deve a parte dele.", debts: "Entra" },
  { state: "paid", when: "Ninguém deve mais nada.", debts: "Sai" },
];

/** Tabela dos status (antes em Ajustes → Status): só informa, não muda nada. */
export function StatusExplainer() {
  return (
    <>
      <div className="status-explainer">
        <div className="table-wrap">
          <table className="state-table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Quando acontece</th>
                <th scope="col">Dívidas</th>
                <th scope="col">Gastos, entradas e faturas</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.state}>
                  <th scope="row">
                    <span className="state-name">
                      <span className="status-dot" style={{ background: STATE_INFO[r.state].color, borderColor: STATE_INFO[r.state].color }} aria-hidden />
                      {STATE_INFO[r.state].label}
                    </span>
                  </th>
                  <td>{r.when}</td>
                  <td className={r.debts === "Entra" ? "yes" : ""}>{r.debts}</td>
                  <td className="yes">Entra</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ marginTop: 10 }}>
          Pagar a fatura não quita quem tem parte na compra: isso continua em Dívidas.
        </p>
      </div>

      <div className="status-explainer">
        <h3 style={{ marginBottom: 6 }}>O que você faz</h3>
        <p className="muted">
          <strong>Pagou a fatura?</strong> Marque como paga em Cartões.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          <strong>Alguém te pagou?</strong> Clique em <strong>Recebi</strong> e diga o valor. Ex.: devia R$ 20, pagou R$ 30 →{" "}
          <span className="profit-badge">+R$ 10 de excedente</span>.
        </p>
      </div>
    </>
  );
}
