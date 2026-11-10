"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowRight, Bell, Check, ChevronLeft, ChevronRight, CircleHelp, CreditCard, Loader2, ShoppingCart, X } from "lucide-react";

/**
 * Tour guiado: cada passo vai até a página certa, destaca a área de verdade (data-tour="…")
 * e explica o que fazer ali. O destaque acompanha a rolagem quadro a quadro (sem animação
 * atrasada) e só desliza quando troca de área sem precisar rolar.
 */
type Demo = "people" | "kinds" | "split" | "card" | "series" | "debts" | "panel" | "bell" | "confirm" | "settings";
type Step = {
  /** Tela ou assunto do passo (aparece em cima do título). */
  chapter: string;
  /** Página do passo (pode ter ?consulta); se for outra, o tour navega até lá. */
  route?: string;
  /** Áreas candidatas (a primeira visível é destacada). Sem área, o balão fica no centro. */
  targets?: string[];
  title: string;
  text: string;
  /** Exemplo ilustrado (no celular, só aparece quando não há área destacada). */
  demo?: Demo;
  /** Texto e exemplo para quando a área principal não existe porque a conta ainda não tem dados. */
  emptyText?: string;
  emptyDemo?: Demo;
};

const STEPS: Step[] = [
  // ---------- Começo ----------
  {
    chapter: "Começo",
    title: "Bem-vindo ao BIRION",
    text: "O BIRION organiza o dinheiro que você divide com outras pessoas: quem pagou, quem deve, quanto sai de cartão e o que ainda vai entrar. Este guia passa por **cada tela** e mostra para que serve cada campo. Dá para sair quando quiser e voltar pelo botão **Tutorial**.",
    demo: "people",
  },
  // ---------- Painel ----------
  {
    chapter: "Painel",
    route: "/painel",
    targets: ["dash-month"],
    title: "Escolha o mês",
    text: "O mês que o app mostra fica no centro da **barra de cima**. Use as setas ou **toque no nome** para escolher mês e ano. Com cartão, cada mês é a **fatura que vence nele**. O botão ao lado fica cinza no mês atual e acende quando você sai dele: toque para voltar.",
    demo: "panel",
  },
  {
    chapter: "Painel",
    route: "/painel",
    targets: ["dash-awaiting"],
    title: "A receber",
    text: "Dinheiro que deveria entrar e que o app **não supõe que entrou**: receitas marcadas como “ainda vou receber” e dívidas a seu favor que já venceram. Caiu na conta? Toque em **Recebi**. O valor de cada pessoa já desconta o que ela pagou e o que você deve a ela.",
    emptyText: "Quando houver dinheiro para entrar (um salário, uma venda, alguém que te deve), aparece aqui o quadro **A receber**, com o botão **Recebi**. O app só conta esse dinheiro depois que você confirma que recebeu.",
  },
  {
    chapter: "Painel",
    route: "/painel",
    targets: ["dash-summary"],
    title: "Resumo do mês",
    text: "Três números: quanto **te devem**, quanto você paga de **cartão** neste mês (só a sua parte, não a dos outros) e quanto **você deve**. Toque em cada um para ver os detalhes.",
  },
  {
    chapter: "Painel",
    route: "/painel",
    targets: ["dash-outlook"],
    title: "Próximos 12 meses",
    text: "Quanto já está comprometido em cada mês com **parcelas** e **contas fixas**. Serve para ver antes se um mês vai apertar. Toque num mês para abrir.",
  },
  {
    chapter: "Painel",
    route: "/painel",
    targets: ["dash-recent"],
    title: "Últimos lançamentos",
    text: "O que entrou neste mês: despesas em **vermelho**, receitas em **verde**. Embaixo de cada um, os selos dizem quem já pagou e quem ainda deve, na **cor da pessoa**.",
    emptyText: "Ainda não há lançamentos neste mês. Quando houver, os últimos aparecem aqui, com despesas em **vermelho** e receitas em **verde**.",
  },
  {
    chapter: "Painel",
    targets: ["new-fab", "tx-new"],
    title: "Novo lançamento",
    text: "O botão **+** abre um lançamento novo em qualquer tela. A seguir, cada campo dele.",
  },
  // ---------- Novo lançamento ----------
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-kind"],
    title: "Tipo",
    text: "**Despesa**: algo que foi pago (mercado, aluguel). **Receita**: dinheiro que entra, como salário ou bolsa. **Dívida**: alguém fica te devendo sem ser uma conta dividida (emprestou dinheiro, vendeu algo para pagar depois). **Acerto**: alguém pagou alguém para quitar o que devia.",
    demo: "kinds",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-amount"],
    title: "Valor",
    text: "O valor total. Em **Parcelado**, é o valor da compra inteira (o app divide nas parcelas). Em **Todo mês**, é o valor de cada mês.",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-desc"],
    title: "Descrição",
    text: "Um nome curto: “Mercado”, “Conta de luz”, “Notebook”. Com uma regra em Ajustes → Categorias, uma descrição como “uber” já ganha a categoria sozinha.",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-date"],
    title: "Data",
    text: "Decide o **mês** do lançamento. **Pix, dinheiro ou débito** entram no mês da data. **No cartão**, entram no mês em que a fatura **vence** (num cartão que fecha dia 3, a compra do dia 5 vai para a fatura seguinte). Data no futuro vira previsão.",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-repeat"],
    title: "Repetição",
    text: "**Uma vez**; **Parcelado** (10x cria as 10 parcelas, uma em cada fatura); ou **Todo mês** (aluguel, assinatura, salário: repete sem data para acabar). Parcelas que já venceram não entram: o app olha de hoje para frente.",
    demo: "series",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-payer"],
    title: "Quem pagou",
    text: "Quem tirou o dinheiro do bolso. Foi outra pessoa (seu amigo pagou o almoço)? Escolha ela: aí é **você** quem fica devendo a sua parte para ela.",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-card", "tx-card-hint"],
    title: "Cartão",
    text: "Foi no cartão? Escolha qual, e logo embaixo aparece em qual **fatura** a compra entra. Cada pessoa vê os próprios cartões; no cartão, quem pagou é sempre o dono dele. Sem cartão (Pix, dinheiro) conta no mês da data.",
    demo: "card",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-split"],
    title: "Quem deveria pagar",
    text: "Quem tem parte na conta. Marcou você e mais alguém? A conta é dividida e cada um fica devendo a sua parte para quem pagou. A **seta** entre os campos mostra para onde o dinheiro tem que ir.",
    demo: "split",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-split-mode"],
    title: "Como dividir",
    text: "**Partes iguais** divide por igual. **Valores diferentes** deixa você digitar quanto é de cada um (aluguel de R$ 700: R$ 500 da sua mãe e R$ 200 seus). A soma precisa dar o total.",
    emptyText: "Com mais de uma pessoa na conta, aparece a escolha entre **Partes iguais** e **Valores diferentes** (para digitar quanto é de cada um, como R$ 500 e R$ 200 num aluguel de R$ 700).",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-category"],
    title: "Categoria",
    text: "Para onde foi o dinheiro: Mercado, Transporte, Casa… É o que monta os **gastos por categoria** do painel e da exportação. Só despesa tem categoria.",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-state"],
    title: "Status",
    text: "O app calcula sozinho: **Pago** (ninguém deve nada), **A acertar** (alguém ainda deve a parte), **Na fatura** (cartão ainda não pago) e **A receber** (dinheiro que não caiu). Você não escolhe.",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-impact"],
    title: "O que este lançamento muda",
    text: "Abra para ver, antes de salvar, o efeito do lançamento: quem passa a dever quanto, em qual mês e em qual fatura ele entra.",
  },
  {
    chapter: "Novo lançamento",
    route: "/transacoes/nova",
    targets: ["tx-people"],
    title: "Pessoas",
    text: "Alguém novo na conta? Cadastre um **contato** (sem login) ou **convide** para o app, sem sair do lançamento. Depois é só escolher a pessoa nos campos.",
  },
  // ---------- Lançamentos ----------
  {
    chapter: "Lançamentos",
    route: "/transacoes",
    targets: ["debts-tab"],
    title: "Duas abas",
    text: "A primeira tem o **nome do mês** (ou da fatura) e mostra tudo daquele mês. A aba **Dívidas** mostra quem deve para quem somando **todos os meses**, porque dívida não some quando o mês vira.",
  },
  {
    chapter: "Lançamentos",
    route: "/transacoes",
    targets: ["tx-search"],
    title: "Busca e filtros",
    text: "Pesquise pela descrição. Em **Filtros**: **Pessoa** (“Gastos de Fulano” mostra só a parte dele; “Fulano tem a receber” mostra o que devem a ele), **Categoria** e **Status**. A barra fica presa no topo enquanto você rola.",
  },
  {
    chapter: "Lançamentos",
    route: "/transacoes",
    targets: ["tx-first", "tx-list-empty"],
    title: "Cada lançamento",
    text: "Vermelho é despesa, verde é receita. Os selos mostram cada pessoa: **deve** (na cor dela), **pagou** ou **confirmando**. Dívida paga em parte fica com o valor antigo **riscado** e o que falta ao lado; pagou a mais, aparece o **lucro**. Toque para editar, ou marque as caixinhas para mudar vários de uma vez.",
    emptyText: "Ainda não há lançamentos. Assim aparece um: o valor, quem pagou e um selo por pessoa (**deve**, na cor dela, ou **pagou**).",
    emptyDemo: "split",
  },
  {
    chapter: "Lançamentos",
    route: "/transacoes",
    targets: ["fixed-bills"],
    title: "Contas fixas",
    text: "Tudo que repete **todo mês**, com o valor e quando vem o próximo. É só para consulta: para mudar ou parar, abra o lançamento.",
    emptyText: "Quando você cadastrar algo **Todo mês** (aluguel, assinatura, salário), aparece aqui o quadro **Contas fixas**, com cada uma e a data da próxima.",
  },
  {
    chapter: "Lançamentos",
    route: "/transacoes",
    targets: ["tx-actions"],
    title: "Lançar vários",
    text: "Para registrar muitos de uma vez (as compras do fim de semana, por exemplo), numa tabela rápida.",
  },
  {
    chapter: "Lançamentos",
    route: "/transacoes",
    title: "Mudar uma parcela",
    text: "Ao editar uma parcela, ou um mês de algo que repete, aparece **Salvar a mudança em**: **Só esta parcela** (o padrão: ex., neste mês sua mãe pagou o aluguel inteiro) ou **Esta e as próximas** (valor e divisão mudam daqui para frente). Em **Todo mês** também tem **Parar de repetir**.",
  },
  {
    chapter: "Dívidas",
    route: "/transacoes?dividas=1",
    targets: ["debts"],
    title: "Quem deve para quem",
    text: "O saldo de cada pessoa, já descontando o que ela pagou e o que você deve a ela. Escolha uma pessoa no filtro para ver o saldo com ela, **Registrar pagamento do total** e o histórico do que ela já pagou.",
    demo: "debts",
  },
  {
    chapter: "Dívidas",
    route: "/transacoes?dividas=1",
    title: "Recebi e Paguei",
    text: "Abra um lançamento com dívida (ou use o **A receber** do painel): cada pessoa que deve tem **Recebi** (ou **Paguei**), que pergunta **quanto** foi pago de verdade. Menos que o devido? O resto continua em aberto no mesmo lançamento, com o valor antigo riscado. Mais? A diferença vira **lucro**. Se a outra pessoa tem login, ela confirma o pagamento.",
  },
  // ---------- Outras telas ----------
  {
    chapter: "A identificar",
    route: "/identificar",
    targets: ["identify-list"],
    title: "A identificar",
    text: "O que chegou sem categoria, sem quem pagou ou sem quem deveria pagar (do extrato do banco, por exemplo) fica aqui. Complete e o lançamento sai da lista. O número no menu diz quantos faltam.",
  },
  {
    chapter: "Cartões",
    route: "/cartoes",
    targets: ["cards-stats", "cards-intro", "cards"],
    title: "Cartões",
    text: "Cadastre cada cartão com o dia em que a fatura **fecha** e o dia em que **vence**. O app calcula em qual fatura cada compra entra e mostra o total e a **sua parte** (o resto, os outros te devem). Pagou a fatura? **Marcar como paga**. Embaixo ficam os parcelados em andamento.",
    demo: "card",
  },
  {
    chapter: "Projetos",
    route: "/projetos",
    targets: ["projects-new"],
    title: "Projetos",
    text: "Junte os gastos de um assunto: uma viagem, uma reforma, uma festa. Crie o projeto e coloque os lançamentos nele (ou escolha o projeto na hora de lançar). Cada projeto mostra o total e a categoria de cada gasto.",
  },
  {
    chapter: "Para confirmar",
    route: "/confirmar",
    targets: ["confirm-list"],
    title: "Para confirmar",
    text: "Quando alguém **com login** coloca você numa conta, numa dívida ou num pagamento, aparece aqui. Você **aceita** ou **recusa** (e pode dizer o motivo). Só vale nas dívidas depois de aceito. Contatos sem login não precisam confirmar nada.",
    demo: "confirm",
  },
  {
    chapter: "Avisos",
    targets: ["bell"],
    title: "Avisos",
    text: "O **sino** mostra fatura fechando, pagamento recebido, alguém recusou algo seu. Em **Meu perfil** dá para receber os avisos também no celular.",
    demo: "bell",
  },
  // ---------- Ajustes ----------
  {
    chapter: "Ajustes",
    route: "/ajustes",
    targets: ["family-form", "settings-tabs"],
    title: "Família",
    text: "O nome da família e a **moeda**. Família é o grupo que divide as contas. Quem **administra** pode mudar; os outros só veem. As abas acima levam a cada parte dos ajustes.",
    demo: "settings",
  },
  {
    chapter: "Ajustes",
    route: "/ajustes/pessoas",
    targets: ["people-login"],
    title: "Pessoas com login",
    text: "Quem **entra no app**: vê o que o envolve, recebe avisos e **confirma** o que você lança no nome dele. Conta no limite de pessoas do plano, junto com você.",
  },
  {
    chapter: "Ajustes",
    route: "/ajustes/pessoas",
    targets: ["people-contacts"],
    title: "Contatos sem login",
    text: "Quem **entra nas contas, mas não usa o app**: sua mãe, o amigo do churrasco. Não confirma nada; o que você lança vale direto. Parado e sem dever nada, some das listas sozinho e volta ao aparecer num lançamento. O **aviãozinho** manda um convite para ele virar “com login”.",
  },
  {
    chapter: "Ajustes",
    route: "/ajustes/membros",
    targets: ["members-invite", "members-access"],
    title: "Acesso e convites",
    text: "Quem tem login na família e o papel de cada um: **Administra** (vê e muda tudo) ou **Membro** (vê o que o envolve). Em **Convidar alguém**, gere um link e mande para a pessoa entrar.",
  },
  {
    chapter: "Ajustes",
    route: "/ajustes/categorias",
    targets: ["list-categories"],
    title: "Categorias",
    text: "Crie, mude a cor ou esconda categorias. Esconder não apaga: os lançamentos antigos continuam com ela.",
  },
  {
    chapter: "Ajustes",
    route: "/ajustes/categorias",
    targets: ["category-rules"],
    title: "Categorização automática",
    text: "Regras do tipo “a descrição tem **uber** → Transporte”. Valem para os lançamentos novos e para os importados do banco.",
  },
  {
    chapter: "Ajustes",
    route: "/ajustes/importacao",
    targets: ["import-file"],
    title: "Importação",
    text: "Mande o extrato do banco ou da fatura (**OFX** ou **CSV**, de qualquer banco). O app cria os lançamentos sem duplicar, e o que ficar faltando vai para **A identificar**.",
  },
  {
    chapter: "Ajustes",
    route: "/ajustes/exportacao",
    targets: ["export-who"],
    title: "Exportar: de quem",
    text: "O seu extrato ou o de **outra pessoa**: os gastos dela por categoria, os lançamentos dela e a dívida entre vocês, item por item. Bom para mandar a quem te deve e não tem login. Sai com o **nome e a foto** de cada um.",
  },
  {
    chapter: "Ajustes",
    route: "/ajustes/exportacao",
    targets: ["export-files"],
    title: "Planilha ou PDF",
    text: "Escolha o mês no calendário. A **planilha** tem uma aba para cada parte; o **PDF** é um extrato pronto para mandar. Os dois têm o mesmo conteúdo, com **+** verde para o que entra, **−** vermelho para o que sai e as contas fixas separadas em **Recorrentes**.",
  },
  // ---------- Fim ----------
  {
    chapter: "Sua conta",
    targets: ["user-menu"],
    title: "Sua conta",
    text: "Na sua foto: **Meu perfil** (foto, nome, cor, senha e avisos no celular), **Ajustes**, **Como funciona** (cada termo explicado com exemplos) e **Sair**.",
  },
  {
    chapter: "Fim",
    targets: ["help"],
    title: "Pronto!",
    text: "Agora você conhece todas as telas. Para rever, toque em **Tutorial**. Dúvida num termo? **Como funciona** explica cada um.",
  },
];

const MOBILE = 640;
const PAD = 8;

const SEEN_KEY = "bf-tour-seen";
const OPEN_EVENT = "bf-open-tour";
const SEEN_EVENT = "bf-tour-seen-change";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(SEEN_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SEEN_EVENT, cb);
  };
}
function seenSnapshot() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

/** Texto do passo: **palavra** fica em destaque. */
function TourText({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="tour-key">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

/** Botão "Tutorial" na barra de cima, ao lado das notificações: abre o tour. */
export function HelpButton({ className = "tutorial-btn" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} data-tour="help" title="Abrir o tutorial">
      <CircleHelp size={16} strokeWidth={1.9} aria-hidden /> <span className="tutorial-label">Tutorial</span>
    </button>
  );
}

/** Miniaturas que imitam as telas reais (dados de exemplo, não da conta). */
function DemoView({ kind }: { kind: Demo }) {
  switch (kind) {
    case "people":
      return (
        <div className="tour-demo">
          {[
            ["V", "Você", "tem login"],
            ["P", "Pessoa 1", "tem login"],
            ["F", "Fulano", "sem login"],
          ].map(([a, n, t]) => (
            <div key={n} className="tour-demo-row">
              <span className="tour-demo-avatar">{a}</span>
              <span className="grow">{n}</span>
              <span className={`tour-demo-tag${t === "sem login" ? " muted" : ""}`}>{t}</span>
            </div>
          ))}
        </div>
      );
    case "kinds":
      return (
        <div className="tour-demo">
          <div className="tour-demo-seg">
            <span className="on">Despesa</span>
            <span>Receita</span>
            <span>Dívida</span>
            <span>Acerto</span>
          </div>
          <div className="tour-demo-row">
            <span className="grow faint">Valor</span>
            <strong>R$ 90,00</strong>
          </div>
        </div>
      );
    case "split":
      return (
        <div className="tour-demo">
          <div className="tour-demo-row">
            <span className="tour-demo-icon" aria-hidden>
              <ShoppingCart size={15} strokeWidth={1.8} />
            </span>
            <span className="grow">
              <span className="tour-demo-title">Mercado</span>
              <span className="tour-demo-sub">Você pagou · dividido com Fulano</span>
            </span>
            <strong>R$ 90,00</strong>
          </div>
          <div className="tour-demo-row">
            <span className="tour-demo-check" aria-hidden>
              <Check size={11} strokeWidth={3} />
            </span>
            <span className="grow">Você</span>
            <span>R$ 45,00</span>
          </div>
          <div className="tour-demo-row">
            <span className="tour-demo-check" aria-hidden>
              <Check size={11} strokeWidth={3} />
            </span>
            <span className="grow">Fulano</span>
            <strong className="pos">te deve R$ 45,00</strong>
          </div>
        </div>
      );
    case "card":
      return (
        <div className="tour-demo">
          {[
            ["Cartão A", "fecha 03 · vence 10", "R$ 1.200,00"],
            ["Cartão B", "fecha 07 · vence 13", "R$ 300,00"],
          ].map(([n, d, v]) => (
            <div key={n} className="tour-demo-row">
              <span className="tour-demo-icon" aria-hidden>
                <CreditCard size={15} strokeWidth={1.8} />
              </span>
              <span className="grow">
                <span className="tour-demo-title">{n}</span>
                <span className="tour-demo-sub">{d}</span>
              </span>
              <strong>{v}</strong>
            </div>
          ))}
          <p className="tour-demo-arrow">Compra no dia 5: no Cartão A vai para a próxima fatura; no B, para a atual.</p>
        </div>
      );
    case "series":
      return (
        <div className="tour-demo">
          {[
            ["nov", "1/10"],
            ["dez", "2/10"],
            ["jan", "3/10"],
          ].map(([m, t]) => (
            <div key={m} className="tour-demo-row">
              <span className="tour-demo-month">{m}</span>
              <span className="grow">Notebook</span>
              <span className="tour-demo-tag">{t}</span>
              <strong>R$ 350,00</strong>
            </div>
          ))}
        </div>
      );
    case "debts":
      return (
        <div className="tour-demo">
          <div className="tour-demo-row">
            <span className="grow">Fulano te deve</span>
            <strong className="pos">R$ 560,00</strong>
            <span className="tour-demo-btn ghost">
              <Check size={12} /> Recebi
            </span>
          </div>
          <p className="tour-demo-arrow">
            <ArrowDown size={14} /> Fulano pagou R$ 500,00
          </p>
          <div className="tour-demo-row">
            <span className="grow">Ainda deve</span>
            <span className="tour-demo-was">R$ 560,00</span>
            <strong className="pos">R$ 60,00</strong>
          </div>
        </div>
      );
    case "panel": {
      const bars = [62, 80, 55, 48, 40, 36, 30, 30, 26, 22, 20, 18];
      return (
        <div className="tour-demo">
          <div className="tour-demo-month-nav">
            <ChevronLeft size={16} aria-hidden />
            <span>
              <span className="tour-demo-badge">A pagar agora</span>
              <strong>Fatura de novembro</strong>
            </span>
            <ChevronRight size={16} aria-hidden />
          </div>
          <div className="tour-demo-bars" aria-hidden>
            {bars.map((h, i) => (
              <span key={i} className={i === 0 ? "on" : ""} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      );
    }
    case "confirm":
      return (
        <div className="tour-demo">
          <div className="tour-demo-row">
            <span className="tour-demo-avatar">P</span>
            <span className="grow">
              <span className="tour-demo-title">Pessoa 1 lançou Mercado</span>
              <span className="tour-demo-sub">Você deve R$ 45,00 para Pessoa 1</span>
            </span>
          </div>
          <div className="tour-demo-row">
            <span className="tour-demo-btn">
              <Check size={12} /> Aceitar
            </span>
            <span className="tour-demo-btn ghost">
              <X size={12} /> Recusar
            </span>
          </div>
        </div>
      );
    case "settings":
      return (
        <div className="tour-demo">
          {[
            ["Família", "nome e moeda"],
            ["Pessoas", "família e contatos"],
            ["Categorias", "e regras automáticas"],
            ["Acesso", "convites"],
            ["Importação", "extrato do banco"],
            ["Exportação", "Excel e PDF"],
          ].map(([n, d]) => (
            <div key={n} className="tour-demo-row">
              <span className="grow tour-demo-title">{n}</span>
              <span className="tour-demo-sub">{d}</span>
            </div>
          ))}
        </div>
      );
    case "bell":
      return (
        <div className="tour-demo">
          <div className="tour-demo-row">
            <span className="tour-demo-icon" aria-hidden>
              <Bell size={15} strokeWidth={1.8} />
            </span>
            <span className="grow">
              <span className="tour-demo-title">Cartão A vence amanhã</span>
              <span className="tour-demo-sub">R$ 1.200,00</span>
            </span>
          </div>
          <div className="tour-demo-row">
            <span className="tour-demo-icon" aria-hidden>
              <Check size={15} strokeWidth={1.8} />
            </span>
            <span className="grow">
              <span className="tour-demo-title">Fulano te pagou</span>
              <span className="tour-demo-sub">R$ 30,00 em Mercado</span>
            </span>
          </div>
        </div>
      );
  }
}


/** clip: até onde vai a barra de cima; o destaque fica embaixo dela (0 quando a área está na própria barra). */
type Box = { top: number; left: number; width: number; height: number; clip: number };

/** Primeira área visível com um destes nomes. */
function findTarget(names: string[] | undefined): HTMLElement | null {
  for (const n of names ?? []) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${n}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/** Área fixa na tela (barra de cima, menu de baixo, botão flutuante): não adianta rolar. */
function isPinned(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).position === "fixed") return true;
  }
  return false;
}

/** Barras que ficam presas no topo ao rolar (barra de cima, busca e filtros de Lançamentos). */
const STICKY = ".topbar, .list-toolbar";

/** Barras presas que ficam por cima da área quando ela sobe (as que vêm antes dela na página). */
function stickyAbove(el: HTMLElement) {
  return [...document.querySelectorAll<HTMLElement>(STICKY)].filter(
    (n) => !n.contains(el) && !el.contains(n) && n.getClientRects().length > 0 && !!(n.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
}

/** Até onde as barras presas cobrem a tela, quando estão grudadas no topo (para não esconder a área). */
function stickyFloor(el: HTMLElement) {
  let floor = 56;
  for (const n of stickyAbove(el)) {
    const top = parseFloat(getComputedStyle(n).top) || 0;
    floor = Math.max(floor, top + n.getBoundingClientRect().height);
  }
  return floor;
}

/** Onde o recorte começa agora: embaixo das barras presas que estão grudadas no topo neste momento. */
function stickyClip(el: HTMLElement) {
  let clip = 0;
  for (const n of stickyAbove(el)) {
    const r = n.getBoundingClientRect();
    const top = parseFloat(getComputedStyle(n).top) || 0;
    // Grudada (no lugar de "top") ou é a barra de cima: cobre o que passa por baixo dela.
    if (n.classList.contains("topbar") || r.top <= top + 1) clip = Math.max(clip, r.bottom);
  }
  return clip;
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5 && Math.abs(a.clip - b.clip) < 0.5);

export function Tutorial({ autoOpen = true }: { autoOpen?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const seen = useSyncExternalStore(subscribe, seenSnapshot, () => true);
  const [manual, setManual] = useState(false);
  const [step, setStep] = useState(0);
  // Área destacada. Entre um passo e outro fica a anterior até a nova aparecer.
  const [box, setBox] = useState<Box | null>(null);
  // Passo cuja área já foi procurada, e se a área principal existia (senão, texto de conta vazia).
  const [found, setFound] = useState<{ step: number; primary: boolean } | null>(null);
  // Desliza destaque e balão (só quando troca de área sem rolar; rolando, eles grudam na área).
  const [glide, setGlide] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const cardH = useRef(240);
  // O passo trocou de página: o destaque aparece direto na área (sem deslizar).
  const navigated = useRef(false);
  const [cardSize, setCardSize] = useState({ w: 360, h: 240 });
  const [vp, setVp] = useState({ w: 1024, h: 768 });
  const open = manual || (autoOpen && !seen);
  // Passo na tela: o texto só troca junto com o destaque, quando a área do próximo passo já foi achada.
  const shown = found?.step ?? step;
  const pending = shown !== step;
  const s = STEPS[shown];
  const last = STEPS.length - 1;
  const empty = !!found && !found.primary;
  const mobile = vp.w < MOBILE;
  const demo = (empty && s.emptyDemo) || (!mobile || !box ? s.demo : undefined);

  useEffect(() => {
    const onOpen = () => {
      setStep(0);
      setFound(null);
      setManual(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    setManual(false);
    setBox(null);
    setFound(null);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* sem armazenamento: só não lembra que já viu */
    }
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, []);

  // Pré-carrega as páginas do tour e guarda o tamanho da tela.
  useEffect(() => {
    if (!open) return;
    for (const r of new Set(STEPS.map((x) => x.route).filter(Boolean) as string[])) router.prefetch(r);
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    document.body.classList.add("tour-open");
    return () => {
      window.removeEventListener("resize", onResize);
      document.body.classList.remove("tour-open");
    };
  }, [open, router]);

  // Vai até a página do passo, acha a área (esperando a página montar), rola até ela
  // e acompanha a posição a cada quadro.
  useEffect(() => {
    if (!open) return;
    const st = STEPS[step];
    const [path, query] = (st.route ?? "").split("?");
    // Mesma página, mas outra aba (ex.: Lançamentos ↔ Dívidas): troca só a consulta.
    const otherTab = !!st.route && pathname === path && (query ? window.location.search !== `?${query}` : path === "/transacoes" && window.location.search.includes("dividas=1"));
    if (st.route && pathname !== path) {
      // Página nova abre no topo; a rolagem até a área vem depois, sem animação.
      navigated.current = true;
      router.push(st.route);
      return; // roda de novo quando a página trocar
    }
    if (otherTab) {
      navigated.current = true;
      router.push(st.route!);
    }
    let alive = true;
    let el: HTMLElement | null = null;
    let raf = 0;
    const track = () => {
      if (!alive) return;
      if (el && !el.isConnected) el = findTarget(st.targets);
      if (el) {
        const r = el.getBoundingClientRect();
        // O destaque fica embaixo da barra de cima e da busca presa (não passa por cima delas).
        const clip = Math.max(0, stickyClip(el));
        const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2, clip };
        setBox((prev) => (sameBox(prev, next) ? prev : next));
      }
      raf = requestAnimationFrame(track);
    };
    const place = (target: HTMLElement) => {
      const primary = !!st.targets && target.matches(`[data-tour="${st.targets[0]}"]`);
      if (!primary && st.emptyDemo) {
        // Conta ainda sem dados: balão no centro, com o exemplo.
        setGlide(true);
        setBox(null);
        setFound({ step, primary });
        return;
      }
      el = target;
      const r = target.getBoundingClientRect();
      const vh = window.innerHeight;
      let delta = 0;
      if (!isPinned(target)) {
        // Celular: área logo abaixo das barras presas, balão embaixo. PC: área + balão centralizados.
        // Nunca por baixo da barra de cima nem da busca presa de Lançamentos.
        const floor = stickyFloor(target) + 16;
        const block = r.height + 12 + cardH.current;
        const want = window.innerWidth < MOBILE ? floor : Math.max(floor, block <= vh - 32 ? (vh - block) / 2 : floor);
        delta = r.top - want;
        // Já está numa boa posição: não mexe.
        if (r.top >= floor && r.bottom + 12 + (window.innerWidth < MOBILE ? 0 : cardH.current) <= vh - 16 && (window.innerWidth >= MOBILE || r.bottom <= vh * 0.5)) delta = 0;
        if (Math.abs(delta) > 2) window.scrollTo({ top: window.scrollY + delta, behavior: "instant" });
      }
      // Na mesma página, o destaque desliza rápido da área anterior até a nova (texto troca junto).
      setGlide(!navigated.current);
      navigated.current = false;
      setFound({ step, primary });
      track();
    };
    const look = () => {
      const t = findTarget(st.targets);
      if (t) {
        mo.disconnect();
        clearTimeout(giveUp);
        place(t);
      }
    };
    const mo = new MutationObserver(look);
    // Área não existe nesta tela (ou o passo não tem área): balão no centro.
    const giveUp = setTimeout(
      () => {
        mo.disconnect();
        if (!alive || el) return;
        navigated.current = false;
        setGlide(true);
        setBox(null);
        setFound({ step, primary: !st.targets });
      },
      st.targets ? 1500 : 0,
    );
    if (st.targets) {
      mo.observe(document.body, { childList: true, subtree: true });
      look();
    }
    return () => {
      alive = false;
      mo.disconnect();
      clearTimeout(giveUp);
      cancelAnimationFrame(raf);
    };
  }, [open, step, pathname, router]);

  // Desliga o deslizar depois da animação, para o destaque voltar a grudar na rolagem.
  useEffect(() => {
    if (!glide) return;
    const t = setTimeout(() => setGlide(false), 250);
    return () => clearTimeout(t);
  }, [glide, step, found]);

  // Tamanho do balão, para posicionar sem sair da tela.
  useEffect(() => {
    if (!open || !card.current) return;
    const ro = new ResizeObserver(([e]) => {
      const h = e.target.getBoundingClientRect().height;
      cardH.current = h;
      setCardSize({ w: e.contentRect.width, h });
    });
    ro.observe(card.current);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    card.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setStep((x) => Math.min(last, x + 1));
      else if (e.key === "ArrowLeft") setStep((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, last]);

  if (!open) return null;

  const { w: vw, h: vh } = vp;
  let cardStyle: CSSProperties;
  let sheetTop = false;
  if (mobile) {
    // Celular: folha fixa no rodapé; se a área estiver embaixo (menu, botão +), a folha vai para o topo.
    sheetTop = !!box && box.top + box.height / 2 > vh * 0.5;
    cardStyle = sheetTop
      ? // Embaixo da barra de cima, que fica por cima de tudo do tutorial.
        { position: "fixed", left: 12, right: 12, top: (box?.clip || 56) + 8, maxHeight: "50dvh" }
      : {
          position: "fixed",
          left: 12,
          right: 12,
          bottom: "calc(12px + env(safe-area-inset-bottom))",
          // Encolhe (o texto rola dentro) para não cobrir a área; no mínimo um terço da tela.
          maxHeight: box ? Math.max(vh * 0.34, Math.min(vh * 0.5, vh - (box.top + box.height) - 20)) : "50dvh",
        };
  } else if (box) {
    const w = Math.min(380, vw - 32);
    const h = cardSize.h;
    const left = Math.min(Math.max(16, box.left), vw - w - 16);
    const below = box.top + box.height + 12;
    const above = box.top - 12 - h;
    // O balão também não sobe por cima da barra de cima.
    const minTop = box.clip + 12;
    const sideTop = Math.min(Math.max(minTop, box.top), vh - h - 16);
    const rightSpace = vw - (box.left + box.width) - 28;
    const leftSpace = box.left - 28;
    if (below + h <= vh - 16) cardStyle = { position: "fixed", top: below, left, width: w };
    else if (above >= minTop) cardStyle = { position: "fixed", top: above, left, width: w };
    else if (rightSpace >= 300) cardStyle = { position: "fixed", top: sideTop, left: box.left + box.width + 12, width: Math.min(w, rightSpace) };
    else if (leftSpace >= 300) cardStyle = { position: "fixed", top: sideTop, left: Math.max(16, box.left - 12 - Math.min(w, leftSpace)), width: Math.min(w, leftSpace) };
    else cardStyle = { position: "fixed", top: Math.max(minTop, vh - h - 16), left, width: w };
  } else {
    const w = Math.min(420, vw - 32);
    cardStyle = { position: "fixed", top: Math.max(72, (vh - cardSize.h) / 2), left: (vw - w) / 2, width: w };
  }

  return createPortal(
    <div className={`tour-layer${glide ? " glide" : ""}`} aria-live="polite">
      {/* O destaque fica embaixo da barra de cima: recortado na linha de baixo dela. */}
      <div className="tour-clip" style={{ top: box?.clip ?? 0 }} aria-hidden>
        <div
          className={`tour-spot${box ? "" : " empty"}`}
          style={
            box
              ? { top: box.top - box.clip, left: box.left, width: box.width, height: box.height }
              : { top: vh / 2, left: vw / 2, width: 0, height: 0 }
          }
        />
      </div>
      <div
        ref={card}
        tabIndex={-1}
        className={`tour-card${mobile ? " sheet" : ""}${sheetTop ? " top" : ""}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
      >
        <div className="tour-card-head">
          <span className="tour-count">
            <span className="tour-chapter">{s.chapter}</span> · {shown + 1} de {STEPS.length}
          </span>
          <button type="button" className="icon-btn tour-close" onClick={close} aria-label="Fechar tutorial">
            <X size={16} />
          </button>
        </div>
        <div key={shown} className="tour-body">
          <h2 id="tour-title">{s.title}</h2>
          <p id="tour-text" className="tour-text">
            <TourText text={empty && s.emptyText ? s.emptyText : s.text} />
          </p>
          {demo && (
            <div className="tour-demo-wrap">
              <span className="tour-demo-label">Exemplo</span>
              <DemoView kind={demo} />
            </div>
          )}
        </div>
        <div className="tour-progress" aria-hidden>
          <span style={{ width: `${((shown + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="tour-nav">
          {shown > 0 ? (
            <button type="button" className="btn ghost small" onClick={() => setStep(Math.max(0, step - 1))}>
              <ArrowLeft size={15} /> Voltar
            </button>
          ) : (
            <button type="button" className="btn ghost small" onClick={close}>
              Pular
            </button>
          )}
          {shown < last ? (
            <button type="button" className="btn primary small" onClick={() => setStep(Math.min(last, step + 1))} aria-busy={pending || undefined}>
              Próximo {pending ? <Loader2 size={15} className="spin" aria-hidden /> : <ArrowRight size={15} />}
            </button>
          ) : (
            <button type="button" className="btn primary small" onClick={close}>
              Concluir
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
