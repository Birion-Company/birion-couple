import { ChevronDown, FileSpreadsheet, FileText } from "lucide-react";

/**
 * Importação: como tirar o arquivo do banco ou do cartão, em CSV e em OFX. Dois blocos recolhíveis,
 * com o caminho nos principais bancos. Os menus dos apps mudam com o tempo; por isso cada item diz onde
 * procurar e, no fim, o que fazer se o banco só der PDF.
 */
type Bank = { name: string; steps: string[]; note?: string };

const CSV: Bank[] = [
  {
    name: "Nubank (conta)",
    steps: ["No app, toque em Extrato (na conta, não no cartão).", "Escolha o mês e toque em Exportar extrato.", "Escolha CSV: o arquivo chega no seu e-mail."],
    note: "A fatura do cartão Nubank sai em PDF. Para as compras do cartão, veja “Se o banco só der PDF” no fim.",
  },
  {
    name: "Mercado Pago (Mercado Livre)",
    steps: ["No app, toque em Seu dinheiro (ou Conta) → Extrato.", "Escolha o período (até 31 dias por vez).", "Formato .csv → Baixar."],
    note: "A fatura do cartão Mercado Pago costuma sair em PDF; o extrato da conta é o que vem em CSV.",
  },
  {
    name: "PayPal",
    steps: ["No site paypal.com, vá em Atividade → Relatórios (ou Extratos).", "Escolha Download de atividades, o período e o formato CSV.", "Quando ficar pronto (pode levar alguns minutos), baixe o arquivo."],
  },
  {
    name: "Inter",
    steps: ["No app ou no site, abra Extrato.", "Toque em Exportar (ou no ícone de download).", "Escolha CSV ou Excel e o período."],
  },
  {
    name: "Itaú, Bradesco, Santander, Banco do Brasil, Caixa",
    steps: ["Pelo site (internet banking) costuma ser mais fácil que pelo app.", "Abra Conta corrente → Extrato e escolha o período.", "Procure Salvar, Exportar ou o ícone de download e escolha CSV ou Excel."],
  },
];

const OFX: Bank[] = [
  {
    name: "Nubank (conta)",
    steps: ["No app, toque em Extrato.", "Escolha o mês e toque em Exportar extrato.", "Escolha OFX: o arquivo chega no seu e-mail."],
  },
  {
    name: "Inter",
    steps: ["No app ou no site, abra Conta Digital → Extrato.", "Toque em Exportar e escolha OFX.", "Escolha o período e baixe."],
  },
  {
    name: "Itaú",
    steps: ["No site do Itaú, entre em Conta corrente → Consultar extrato por período.", "Escolha o período.", "Toque em Salvar em OFX (às vezes aparece como “Money”)."],
  },
  {
    name: "Banco do Brasil",
    steps: ["No site do BB, entre em Conta corrente → Extrato.", "Escolha o período.", "No ícone de salvar, escolha “Money 2000+ (ofx)”."],
  },
  {
    name: "Bradesco, Santander, Caixa, C6 e outros",
    steps: ["No site do banco, abra o Extrato da conta e escolha o período.", "Procure Salvar ou Exportar e escolha OFX (pode aparecer como “Money” ou “Quicken”)."],
  },
];

function Banks({ list }: { list: Bank[] }) {
  return (
    <div className="guide-banks">
      {list.map((b) => (
        <div key={b.name} className="guide-bank">
          <strong>{b.name}</strong>
          <ol>
            {b.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {b.note && <p className="faint">{b.note}</p>}
        </div>
      ))}
    </div>
  );
}

export function ExportGuide() {
  return (
    <section className="section guide" aria-label="Como tirar o arquivo do banco">
      <h2 style={{ marginBottom: 8 }}>Como tirar o arquivo do banco</h2>
      <details className="card guide-item">
        <summary>
          <FileSpreadsheet size={18} strokeWidth={1.8} aria-hidden />
          <span className="grow">
            <strong>Como baixar em CSV</strong>
            <span className="faint">Planilha com data, descrição e valor. Funciona com quase todo banco.</span>
          </span>
          <ChevronDown size={16} strokeWidth={1.8} className="impact-chevron" aria-hidden />
        </summary>
        <Banks list={CSV} />
      </details>
      <details className="card guide-item">
        <summary>
          <FileText size={18} strokeWidth={1.8} aria-hidden />
          <span className="grow">
            <strong>Como baixar em OFX</strong>
            <span className="faint">Formato próprio de extrato bancário: o mais fácil de importar, sem configurar colunas.</span>
          </span>
          <ChevronDown size={16} strokeWidth={1.8} className="impact-chevron" aria-hidden />
        </summary>
        <Banks list={OFX} />
      </details>
      <p className="faint guide-tip">
        <strong>Se o banco só der PDF</strong> (comum na fatura do cartão): importe o extrato da conta em CSV ou OFX, ou lance as compras da fatura em
        Lançamentos → <strong>Lançar vários</strong>, numa tabela rápida. Os menus dos bancos mudam com o tempo: se não achar, procure por “exportar
        extrato OFX” mais o nome do banco.
      </p>
    </section>
  );
}
