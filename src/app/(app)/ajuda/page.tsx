import type { Metadata } from "next";
import { StatusExplainer } from "@/components/status-explainer";
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
    intro: "Quatro passos e o app já trabalha sozinho.",
    items: [
      { term: "1. Cartões", text: <>Cadastre seus cartões em <Link href="/cartoes">Cartões</Link>, com o dia em que a fatura fecha e o dia em que vence.</> },
      { term: "2. Pessoas", text: <>Em <Link href="/ajustes/pessoas">Ajustes → Pessoas</Link>, cadastre quem divide conta com você. Quem vai usar o app recebe um convite.</> },
      { term: "3. Lançamentos", text: <>Use <Link href="/transacoes/nova">Novo lançamento</Link> (o botão + ) ou <Link href="/importar">importe o extrato</Link> do banco.</> },
      { term: "4. Acompanhe", text: <>O <Link href="/painel">Painel</Link> mostra o mês; <Link href="/transacoes?dividas=1">Lançamentos → Dívidas</Link>, quem deve para quem.</> },
    ],
  },
  {
    id: "mes",
    title: "O mês na tela",
    intro: "Painel, Lançamentos e Dívidas mostram um mês por vez.",
    items: [
      { term: "Abre onde importa", text: "Na fatura que você tem que pagar agora. Com cartão, o mês é o da fatura (o mês em que ela vence)." },
      { term: "Trocar de mês", text: "O mês fica no centro da barra de cima. Use as setas ou toque no nome do mês para escolher mês e ano. A setinha curva volta para o mês atual." },
      { term: "Até onde vai", text: "Do primeiro mês em que você usou o app até o último mês com algo lançado (ex.: a última parcela do celular). Fora disso, aparece um aviso." },
      { term: "Meses à frente", text: "Mostram uma previsão: só o que é daquele mês (parcelas e contas fixas), contando que o resto já foi pago." },
    ],
  },
  {
    id: "secoes",
    title: "Onde fica cada coisa",
    items: [
      { term: "Painel", text: "Resumo do mês: quanto te devem, quanto você paga de cartão, quanto você deve, os próximos meses e os gastos por categoria." },
      { term: "Lançamentos", text: "Tudo o que foi lançado no mês, com pesquisa, filtros e edição de vários de uma vez." },
      { term: "A identificar", text: "Lançamentos com algo faltando (categoria, quem pagou ou quem deveria pagar)." },
      { term: "Dívidas", text: "Em Lançamentos, aba Dívidas: quem deve para quem e tudo o que ainda está em aberto, de todos os meses. Escolha uma pessoa no filtro para ver o saldo com ela e o que ela já pagou." },
      { term: "Cartões", text: "Faturas de cada cartão: a que vence, a aberta, a parte de cada pessoa e os parcelados." },
      { term: "Projetos", text: "Juntam gastos de um assunto, como uma viagem. No celular, ficam no menu da sua foto." },
      { term: "Para confirmar", text: "O que outra pessoa colocou no seu nome e você precisa aceitar ou recusar." },
      { term: "Sino", text: "Avisos: fatura fechando ou vencendo e o que outras pessoas fizeram com você." },
    ],
  },
  {
    id: "tipos",
    title: "Tipos de lançamento",
    intro: "A seta no formulário mostra de onde o dinheiro vai ter que sair e para onde vai.",
    items: [
      { term: "Despesa", text: "Algo que foi pago. Quem tem parte fica devendo para quem pagou. Ex.: mercado de R$ 100 dividido com Fulano → ele te deve R$ 50." },
      { term: "Receita", text: "Dinheiro para você (salário, venda). Ao lançar, diga se já caiu na conta ou se ainda vai receber. Se alguém te pagou uma dívida, use Acerto." },
      { term: "A receber", text: "O app não supõe que o dinheiro caiu: a receita fica “A receber” e só conta nas entradas quando você toca em Recebi. O painel mostra as atrasadas. Salário todo mês começa “a receber” a cada mês." },
      { term: "Dívida", text: "Alguém fica te devendo (ou você a alguém): um empréstimo ou algo vendido para pagar depois. Ex.: vendeu um notebook por R$ 5.600 em 10x → ele te deve R$ 560 por mês." },
      { term: "Acerto", text: "Dinheiro que passou de uma pessoa para outra para abater uma dívida." },
      { term: "Pessoas", text: "“Quem deveria pagar” abre uma lista com pesquisa. Para cadastrar alguém sem sair do lançamento, use o botão Pessoas no canto de baixo." },
    ],
  },
  {
    id: "repeticao",
    title: "Parcelado e todo mês",
    items: [
      { term: "Parcelado", text: "Valor total e número de parcelas. Ex.: R$ 1.200 em 12x cria 12 meses de R$ 100." },
      { term: "Todo mês", text: "Repete sem data para acabar (ex.: aluguel, Spotify). Para parar: abra o lançamento em Lançamentos e toque em “Parar de repetir”." },
      { term: "Começou no passado?", text: "O app olha de hoje para frente: parcelas que já venceram não entram. Ex.: celular em 24x desde abril começa na 7ª." },
      { term: "Virar repetição depois", text: "Abra um lançamento avulso e escolha Parcelado ou Todo mês: ele vira o primeiro." },
      { term: "Mudar uma parcela", text: "Ao editar, escolha “Só esta parcela” (um mês diferente, ex.: sua mãe pagou o aluguel inteiro) ou “Esta e as próximas” (valor e divisão mudam daqui para frente)." },
    ],
  },
  {
    id: "cartoes",
    title: "Cartões e faturas",
    intro: "Cada cartão tem o próprio dia de fechamento e de vencimento — o app cuida disso sozinho.",
    items: [
      { term: "Fechamento", text: "Compras até a véspera do fechamento entram na fatura atual; do dia do fechamento em diante, na seguinte." },
      { term: "Vencimento", text: "É o dia de pagar. A compra conta no mês em que a fatura dela vence." },
      { term: "Exemplo", text: "Nubank fecha dia 3 e vence dia 10; Mercado Livre fecha dia 7 e vence dia 13. Uma compra no dia 5 cai na fatura de dezembro no Nubank (já fechou) e na de novembro no Mercado Livre (ainda não fechou)." },
      { term: "No lançamento", text: "Ao escolher o cartão, aparece em qual fatura a compra entra, quando fecha e quando vence." },
      { term: "Sua parte", text: "Se outras pessoas têm parte numa compra, a fatura mostra o total e quanto é seu. A parte delas vira dívida com você." },
      { term: "Fatura paga", text: "Marque em Cartões. As compras viram Pago. Pagar a fatura não quita quem te deve: isso continua em Dívidas." },
    ],
  },
  {
    id: "dividas",
    title: "Dívidas e pagamentos",
    items: [
      { term: "Recebi / Paguei", text: "Registra o pagamento de uma dívida e pergunta o valor. Não cria um lançamento novo: abate a própria dívida." },
      { term: "Pagou menos", text: "O que falta continua devido. O valor antigo aparece riscado e o novo embaixo. Ex.: devia R$ 560, pagou R$ 500 → falta R$ 60." },
      { term: "Pagou mais", text: "A diferença aparece como lucro. Se foi só neste mês (ex.: sua mãe pagou o aluguel todo), mude a divisão só desta parcela." },
      { term: "Desfazer", text: "Cada pagamento tem “Desfazer”: a dívida volta." },
      { term: "Registrar pagamento", text: "Um valor solto entre duas pessoas: abate as dívidas mais antigas primeiro." },
      { term: "Muita gente", text: "“Quem deve para quem” mostra as maiores primeiro, com “Ver mais” e pesquisa." },
    ],
  },
  {
    id: "confirmar",
    title: "Para confirmar",
    intro: "Ninguém coloca uma dívida no seu nome sem você saber.",
    items: [
      { term: "Quando aparece", text: "Quando alguém com login lança algo que envolve você: uma conta dividida, uma dívida ou um pagamento." },
      { term: "Aceitar", text: "O lançamento passa a valer nas dívidas." },
      { term: "Recusar", text: "Você pode dizer o motivo (ex.: “o valor está errado”). Quem lançou é avisado na hora e pode corrigir ou excluir." },
      { term: "Corrigiu?", text: "Se mudar valor, divisão ou quem pagou, pede sua confirmação de novo. Mudar descrição ou categoria não pede." },
      { term: "Parcelas", text: "Aceitar uma parcela aceita a compra inteira." },
      { term: "Contatos", text: "Pessoas sem login não confirmam nada: só quem usa o app." },
    ],
  },
  {
    id: "status",
    title: "Status",
    intro: "Automático: você não escolhe. Só informa em que pé está cada lançamento.",
    items: [
      { term: "Na fatura", text: "Compra no cartão com a fatura ainda aberta. Vira Pago quando a fatura é paga." },
      { term: "A acertar", text: "Alguém ainda deve a parte dele." },
      { term: "Pago", text: "Ninguém deve mais nada." },
    ],
  },
  {
    id: "projetos",
    title: "Projetos",
    items: [
      { term: "Para que serve", text: "Juntar o que foi gasto num assunto, mesmo em categorias diferentes. Ex.: viagem = combustível + hotel + restaurantes." },
      { term: "Como usar", text: <>Crie em <Link href="/projetos">Projetos</Link>, abra e toque em “Colocar lançamentos”. Ou escolha o projeto ao lançar.</> },
    ],
  },
  {
    id: "ajustes",
    title: "Ajustes, aba por aba",
    items: [
      { term: "Família", text: "Nome da família e moeda. Embaixo, apagar a família: tudo some e a conta fica bloqueada até criar uma família nova." },
      { term: "Pessoas", text: "Família (com login, até 10) e contatos (sem login). Pesquise, cadastre, esconda ou convide." },
      { term: "Categorias", text: "Mercado, Moradia, Saúde… Arraste para ordenar. Embaixo, a categorização automática: “uber” → Transporte." },
      { term: "Acesso", text: "Links de convite e quem administra a família." },
      { term: "Importação", text: "Extrato do banco (OFX ou CSV), sem repetir o que já entrou." },
      { term: "Exportação", text: "O mês em planilha do Excel ou em PDF, como um extrato de banco: + verde para o que entra, − vermelho para o que sai e as contas fixas separadas em Recorrentes." },
      { term: "Extrato de outra pessoa", text: "Em Exportação, escolha a pessoa em “De quem é o extrato”: sai com os gastos dela por categoria, os lançamentos dela e a dívida entre vocês item por item, com o nome e a foto de cada um. Para mandar a quem te deve e não tem login." },
    ],
  },
  {
    id: "acesso",
    title: "Quem vê o quê",
    items: [
      { term: "Quem administra", text: "Vê e altera tudo da família." },
      { term: "Outros membros", text: "Veem só o que lançaram, pagaram ou em que têm parte. Só quem lançou altera." },
      { term: "Limites", text: `Até ${MEMBERS_MAX} pessoas com login (contando você) e ${CONTACTS_ACTIVE_MAX} contatos ativos.` },
    ],
  },
];

/** Causa → efeitos: como uma ação mexe nas outras partes do app. */
const CONNECTIONS: { cause: string; effects: string[] }[] = [
  { cause: "Despesa dividida", effects: ["Quem tem parte passa a dever", "Soma nos gastos do mês"] },
  { cause: "Compra no cartão", effects: ["Entra na fatura do mês em que vence"] },
  { cause: "Parcelado / todo mês", effects: ["Um lançamento por mês, até a última parcela"] },
  { cause: "Alguém com login no lançamento", effects: ["Vai para Para confirmar dele", "Só vale nas dívidas depois que ele aceita"] },
  { cause: "Recebi / Paguei", effects: ["Abate a dívida (pagou menos: o resto continua)"] },
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
          {s.id === "status" && <StatusExplainer />}
        </section>
      ))}
    </div>
  );
}
