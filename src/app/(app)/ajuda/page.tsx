import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { CONTACTS_ACTIVE_MAX, MEMBERS_MAX } from "@/lib/defaults";

export const metadata: Metadata = { title: "Como funciona" };

type Item = { term: string; text: React.ReactNode };
type Section = { id: string; title: string; intro?: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    id: "comecar",
    title: "Para começar",
    items: [
      { term: "Pessoas", text: "Família: tem login e entra no app. Contato: só divide conta, sem login." },
      { term: "1. Pessoas", text: <>Cadastre em <Link href="/ajustes/pessoas">Ajustes → Pessoas</Link>.</> },
      { term: "2. Convites", text: <>Gere links em <Link href="/ajustes/membros">Ajustes → Acesso</Link>.</> },
      { term: "3. Lançamentos", text: <>Use <Link href="/transacoes/nova">Novo lançamento</Link> ou <Link href="/ajustes/importacao">importe o extrato</Link>.</> },
      { term: "4. Acompanhe", text: <>Saldos em <Link href="/dividas">Dívidas</Link>, faturas em <Link href="/cartoes">Cartões</Link>.</> },
    ],
  },
  {
    id: "secoes",
    title: "As seções",
    items: [
      { term: "Painel", text: "Um mês por vez (até 12 à frente): gastos, entradas, quem te deve e categorias. Com cartão, o mês é o da fatura." },
      { term: "Lançamentos", text: "Tudo o que foi registrado, com busca, filtros e edição em lote." },
      { term: "Dívidas", text: "Quem deve para quem, o que gerou cada dívida e o histórico do que já foi pago." },
      { term: "Cartões", text: "Faturas, vencimentos, parte de cada pessoa e parcelados." },
      { term: "Sino", text: "Avisos de fatura e do que outras pessoas fizeram com você. A engrenagem configura o celular." },
      { term: "Ajustes", text: "Pessoas, categorias, projetos, acesso e importação." },
    ],
  },
  {
    id: "tipos",
    title: "Tipos de lançamento",
    items: [
      { term: "Despesa", text: "Algo pago. Quem tem parte fica devendo para quem pagou." },
      { term: "Receita", text: "Dinheiro que entrou. Sem categoria e sem cartão." },
      { term: "Dívida", text: "Alguém fica te devendo. Ex.: Fulano pegou R$ 100 emprestado. Pode ser parcelada." },
      { term: "Acerto", text: "Dinheiro que passou de uma pessoa para outra. Abate a dívida." },
      { term: "No cartão", text: "Quem pagou é o dono do cartão; basta escolher o cartão." },
    ],
  },
  {
    id: "repeticao",
    title: "Parcelado e todo mês",
    items: [
      { term: "Parcelado", text: "Valor total e nº de parcelas. Ex.: R$ 1.200 em 12x cria 12 meses de R$ 100." },
      { term: "Todo mês", text: "Repete o valor sem data para acabar. Para parar: “Parar de repetir”." },
      { term: "Editar", text: "Dá para mudar nº de parcelas, primeiro mês e valor depois de criado." },
      { term: "Importados", text: "“Parcela 2/10” no extrato vira etiqueta e as próximas parcelas são criadas." },
    ],
  },
  {
    id: "status",
    title: "Status",
    intro: "Automático: você não escolhe.",
    items: [
      { term: "Na fatura", text: "Compra no cartão com a fatura ainda aberta. Vira Pago ao marcar a fatura como paga." },
      { term: "A acertar", text: "Alguém ainda deve a parte dele." },
      { term: "Pago", text: "Ninguém deve mais nada." },
    ],
  },
  {
    id: "categorias",
    title: "Categorias e projetos",
    items: [
      { term: "Categoria", text: "Mercado, Moradia, Saúde… Arraste para mudar a ordem." },
      { term: "Regras", text: "Ex.: “descrição contém UBER → Transporte”. Valem para o que já existe e para o que vier." },
      { term: "Projeto", text: "Opcional. Junta gastos de um assunto, como uma viagem." },
    ],
  },
  {
    id: "cartoes",
    title: "Cartões",
    items: [
      { term: "Fechamento", text: "Compras a partir do dia de fechamento vão para a fatura seguinte." },
      { term: "Mês da fatura", text: "Cada compra conta no mês em que a fatura vence. Ex.: “Fatura de novembro”." },
      { term: "Fatura paga", text: "Marque em Cartões. As compras viram Pago e os avisos param. Dá para desfazer." },
    ],
  },
  {
    id: "dividas",
    title: "Dívidas",
    items: [
      { term: "Recebi / Paguei", text: "Quita uma dívida específica e pergunta o valor. Pagou a mais? Aparece como lucro." },
      { term: "Registrar pagamento", text: "Um valor solto que abate as dívidas mais antigas." },
      { term: "Já pago", text: "Fica no histórico, com “Desfazer”." },
      { term: "Parcelas futuras", text: "Só contam no mês delas; antes aparecem como “a vencer”." },
      { term: "Contatos", text: "Digite o nome em Adicionar pessoa (ex.: Fulano). Parado 90 dias e quite, sai das listas e volta ao digitar." },
    ],
  },
  {
    id: "acesso",
    title: "Quem vê o quê",
    items: [
      { term: "Quem administra", text: "Vê e altera tudo." },
      { term: "Outros membros", text: "Veem só o que lançaram, pagaram ou têm parte. Só quem lançou altera." },
      { term: "Limites", text: `Até ${MEMBERS_MAX} pessoas com login (contando você) e ${CONTACTS_ACTIVE_MAX} contatos ativos.` },
    ],
  },
];

/** Causa → efeitos: como uma ação mexe nas outras partes do app. */
const CONNECTIONS: { cause: string; effects: string[] }[] = [
  { cause: "Despesa dividida", effects: ["Quem tem parte passa a dever", "Soma nos gastos do mês"] },
  { cause: "Compra no cartão", effects: ["Entra na fatura do mês em que vence"] },
  { cause: "Parcelado / todo mês", effects: ["Um lançamento por mês"] },
  { cause: "Recebi / Paguei", effects: ["Cria um acerto e tira da dívida"] },
  { cause: "Fatura paga", effects: ["Compras viram Pago"] },
];

export default async function HelpPage() {
  await requireAuth();
  return (
    <div className="help-page">
      <div className="page-head">
        <div>
          <h1>Como funciona</h1>
          <p className="muted">O essencial, em poucas linhas.</p>
        </div>
      </div>
      <section className="card section help-section" aria-labelledby="h-conecta" id="conecta">
        <h2 id="h-conecta">Como tudo se conecta</h2>
        
        <div className="connect">
          {CONNECTIONS.map((c) => (
            <div key={c.cause} className="connect-row">
              <span className="connect-cause">{c.cause}</span>
              <span className="connect-arrow" aria-hidden>→</span>
              <ul className="connect-effects">
                {c.effects.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <nav className="help-toc" aria-label="Assuntos">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="chip">
            {s.title}
          </a>
        ))}
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="card section help-section" aria-labelledby={`h-${s.id}`}>
          <h2 id={`h-${s.id}`}>{s.title}</h2>
          {s.intro && <p className="faint">{s.intro}</p>}
          <dl>
            {s.items.map((i) => (
              <div key={i.term} className="help-item">
                <dt>{i.term}</dt>
                <dd>{i.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
