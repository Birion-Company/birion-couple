import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { FAMILY_PEOPLE_MAX } from "@/lib/defaults";

export const metadata: Metadata = { title: "Como funciona" };

type Item = { term: string; text: React.ReactNode };
type Section = { id: string; title: string; intro?: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    id: "comecar",
    title: "Para começar",
    items: [
      {
        term: "O que é uma pessoa",
        text: "Cada integrante que entra nas contas: quem paga alguma coisa e com quem ela é dividida. As dívidas são sempre entre pessoas. Pessoa não é o mesmo que login: alguém pode ser uma pessoa sem nunca abrir o app; quem entra pelo convite vira uma pessoa ligada à própria conta.",
      },
      { term: "1. Cadastre as pessoas", text: <>Em <Link href="/ajustes/pessoas">Ajustes → Pessoas</Link>, cadastre quem divide as contas. Não precisam ter login.</> },
      { term: "2. Convide quem vai usar", text: <>Em <Link href="/ajustes/membros">Ajustes → Acesso</Link>, gere um link de convite para cada pessoa que vai entrar no app.</> },
      { term: "3. Lance ou importe", text: <>Registre gastos em <Link href="/transacoes/nova">Novo lançamento</Link> ou traga o extrato do banco em <Link href="/importar">Importar</Link>.</> },
      { term: "4. Acompanhe", text: <>Veja quem deve para quem em <Link href="/dividas">Dívidas</Link> e as faturas em <Link href="/cartoes">Cartões</Link>.</> },
    ],
  },
  {
    id: "secoes",
    title: "As seções do app",
    items: [
      { term: "Painel", text: "Resumo: quem deve para quem, gastos e entradas do período, pendências, gastos por categoria e últimos lançamentos. Os filtros (período, pessoa, categoria…) mudam tudo, menos o bloco de dívidas." },
      { term: "Lançamentos", text: "A lista de tudo que foi registrado, agrupada por mês, com busca e filtros. Dá para selecionar vários e mudar status, categoria ou projeto de uma vez. Também mostra o que se repete todo mês." },
      { term: "Novo lançamento", text: "Onde se registra uma despesa, receita, empréstimo ou acerto, com divisão entre pessoas, cartão e repetição." },
      { term: "Dívidas", text: "Quanto cada pessoa te deve ou você deve, com o extrato do que gerou cada dívida e os botões para registrar pagamento ou marcar como acertado." },
      { term: "Cartões", text: "Cada cartão com a fatura aberta, o próximo vencimento, as próximas faturas, a parte de cada pessoa e os parcelados em andamento." },
      { term: "Importar", text: "Traz lançamentos de um arquivo OFX ou CSV do banco, sem repetir o que já foi importado." },
      { term: "Ajustes", text: "Família, pessoas, categorias, projetos, status, acesso e modelos de importação. Tudo pode ser mudado a qualquer hora." },
      { term: "Meu perfil", text: "Foto, nome, e-mail e senha. Fica no botão com o seu nome." },
    ],
  },
  {
    id: "tipos",
    title: "Tipos de lançamento",
    items: [
      { term: "Despesa", text: "Algo que foi pago. Escolha quem pagou e entre quem dividir: cada pessoa passa a dever a parte dela para quem pagou." },
      { term: "Receita", text: "Dinheiro que entrou (salário, venda, estorno). Se dividir, quem recebeu fica devendo a parte de cada um." },
      { term: "Empréstimo", text: "Dinheiro emprestado ou algo pago só para outra pessoa. Quem pegou emprestado fica devendo o valor todo para quem emprestou." },
      { term: "Acerto", text: "Pagamento de uma dívida entre pessoas. Abate o que uma deve para a outra. O botão “Registrar pagamento” já preenche um acerto." },
      { term: "Quem pagou × quem deveria pagar", text: "Quem pagou é quem tirou o dinheiro do bolso. Quem deveria pagar é de quem é a conta: uma pessoa só (deve tudo para quem pagou) ou várias, em partes iguais ou com valores diferentes. A diferença entre os dois vira dívida." },
    ],
  },
  {
    id: "repeticao",
    title: "Parcelado e todo mês",
    items: [
      { term: "Uma vez", text: "Um lançamento só." },
      { term: "Parcelado", text: "Informe o valor total e o número de parcelas: são criadas as parcelas mês a mês, cada uma com a mesma divisão. Ex.: notebook de R$ 3.500 em 10x." },
      { term: "Todo mês", text: "Repete o mesmo valor todo mês, sem data para acabar (ou por alguns meses, se preferir). Cada mês é criado quando chega. Para parar, use “Parar de repetir” em Lançamentos." },
      { term: "Editar uma parcela", text: "Valor, data, divisão e status mudam só naquela. Descrição, categoria, projeto, cartão e quem pagou podem ser levados para as outras. Também dá para excluir aquela e as próximas." },
    ],
  },
  {
    id: "status",
    title: "Status",
    intro: "Os nomes podem ser os que a família quiser; o que vale é o significado de cada um.",
    items: [
      { term: "Pendente", text: "Ainda falta resolver. Aparece em Pendências no painel. Se alguém já pagou e dividiu, os outros já aparecem devendo." },
      { term: "Pago, a acertar", text: "Alguém já pagou e os outros vão acertar a parte deles. Conta nas dívidas, mas sai de Pendências." },
      { term: "Acertado", text: "Já foi reembolsado ou acertado. Sai das dívidas e de Pendências." },
    ],
  },
  {
    id: "categorias",
    title: "Categorias e projetos",
    items: [
      { term: "Categoria", text: "Com o que o dinheiro foi gasto (Mercado, Moradia, Saúde…). Alimenta o gráfico “Gastos por categoria” e os filtros." },
      { term: "Categorização automática", text: "Regras do tipo “se a descrição contém UBER, use Transporte”, aplicadas sozinhas ao importar extratos." },
      { term: "Projeto", text: "Opcional. Junta lançamentos de um mesmo assunto, como uma viagem ou uma reforma, para ver o custo total." },
    ],
  },
  {
    id: "cartoes",
    title: "Cartões de crédito",
    items: [
      { term: "Cartões de cada pessoa", text: "Cada pessoa tem os próprios cartões, até 3 ativos, independentes dos outros. Só o dono vê e mexe nos seus (quem administra vê todos). Ao lançar, o cartão escolhido tem que ser de quem pagou." },
      { term: "Fechamento e vencimento", text: "Ao cadastrar, informe o dia em que a fatura fecha; o vencimento é sugerido uma semana depois e pode ser ajustado. Compras a partir do dia de fechamento vão para a fatura seguinte." },
      { term: "Sua parte da fatura", text: "Quando uma compra no cartão é dividida, a fatura mostra quanto é seu e quanto cada pessoa deve daquela fatura." },
      { term: "Avisos", text: "Perto do fechamento ou do vencimento, o dono do cartão recebe um aviso ao abrir o app. Dá para lembrar no dia seguinte ou não lembrar mais daquela fatura." },
    ],
  },
  {
    id: "dividas",
    title: "Dívidas",
    items: [
      { term: "Como se formam", text: "Sempre que alguém paga e divide com outras pessoas, ou registra um empréstimo. Acertos abatem." },
      { term: "Parcelas futuras", text: "Só contam quando chega o mês delas. Antes disso aparecem como “a vencer”." },
      {
        term: "Registrar pagamento",
        text: "Use quando o dinheiro passou de verdade de uma pessoa para a outra (Pix, dinheiro, transferência). Cria um Acerto com o valor, que diminui ou zera a dívida. Se a pessoa pagou só uma parte, troque o valor antes de salvar. O pagamento fica no histórico.",
      },
      {
        term: "Acertado",
        text: "Tira um lançamento específico da conta sem registrar dinheiro. Use quando aquilo já foi resolvido de outro jeito: foi pago antes de vocês usarem o app, ou combinaram que não precisa pagar. O lançamento continua no histórico, só deixa de contar como dívida.",
      },
      { term: "Qual usar?", text: "O dinheiro passou de mão? Registrar pagamento. Só quer tirar um item da conta? Acertado." },
    ],
  },
  {
    id: "importar",
    title: "Importar extratos",
    items: [
      { term: "OFX e CSV", text: "OFX é lido direto, inclusive fatura de cartão. No CSV você escolhe qual coluna é a data, a descrição e o valor, e pode salvar como modelo." },
      { term: "Sem repetir", text: "O que já foi importado é reconhecido e fica desmarcado. O pagamento da fatura também começa desmarcado, porque não é gasto." },
      { term: "Apagar uma importação", text: "Na lista de importações recentes, a lixeira remove o arquivo e todos os lançamentos que vieram dele." },
    ],
  },
  {
    id: "acesso",
    title: "Quem vê e quem altera",
    items: [
      { term: "Quem administra", text: "Vê e altera tudo da família, inclusive Ajustes." },
      { term: "Outros membros", text: "Só veem os lançamentos que criaram, pagaram ou dos quais têm uma parte. Gastos só de outra pessoa ficam privados." },
      { term: "Alterar e excluir", text: "Só quem lançou (ou quem administra). Os outros veem o lançamento em modo leitura." },
      { term: "O que mudou", text: "Quando alguém cria, altera, exclui ou importa algo que envolve você, aparece um aviso na sua próxima visita." },
      { term: "Limites", text: `Até ${FAMILY_PEOPLE_MAX} pessoas ativas por família; o nome da família tem até 20 caracteres.` },
    ],
  },
];

/** Causa → efeitos: como uma ação mexe nas outras partes do app. */
const CONNECTIONS: { cause: string; effects: string[] }[] = [
  { cause: "Despesa paga e dividida", effects: ["Dívidas: cada pessoa passa a dever a parte dela para quem pagou", "Painel: soma em Gastos e na categoria", "Pendências: entra se o status for pendente"] },
  { cause: "Compra no cartão", effects: ["Fatura do dono do cartão, no mês certo pelo dia de fechamento", "A fatura mostra a parte de cada pessoa", "Aviso perto do fechamento e do vencimento"] },
  { cause: "Parcelado ou todo mês", effects: ["Um lançamento por mês", "Uma parcela em cada fatura", "Cada parcela só vira dívida no mês dela"] },
  { cause: "Empréstimo", effects: ["Dívidas: quem pegou emprestado deve o valor todo", "Não conta como gasto nem entrada"] },
  { cause: "Registrar pagamento", effects: ["Cria um Acerto que diminui ou zera a dívida", "O pagamento fica no histórico"] },
  { cause: "Marcar como acertado", effects: ["Sai das Dívidas e das Pendências", "Nenhum dinheiro é registrado"] },
  { cause: "Alguém muda algo que te envolve", effects: ["Aviso “O que mudou” na sua próxima visita"] },
];

export default async function HelpPage() {
  await requireAuth();
  return (
    <div className="help-page">
      <div className="page-head">
        <div>
          <h1>Como funciona</h1>
          <p className="muted">Um guia rápido de cada parte do BIRION FINANCE.</p>
        </div>
      </div>
      <section className="card section help-section" aria-labelledby="h-conecta" id="conecta">
        <h2 id="h-conecta">Como tudo se conecta</h2>
        <p className="faint">Cada ação mexe em outras partes do app. Ao preencher um lançamento, o quadro “O que este lançamento muda” mostra isso antes de salvar.</p>
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
