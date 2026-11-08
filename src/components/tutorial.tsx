"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowRight, Check, CircleHelp, X } from "lucide-react";

/**
 * Tour guiado: cada passo leva até a página certa, destaca a área de verdade
 * (marcada no código com data-tour="…") e explica o que fazer ali.
 */
type Step = {
  /** Página do passo; se for outra, o tour navega até lá. */
  route?: string;
  /** Áreas candidatas (a primeira visível é destacada). Sem área, o balão fica no centro. */
  targets?: string[];
  title: string;
  text: string;
  tip?: string;
  /** Miniatura de exemplo dentro do balão (funciona mesmo sem dados na conta). */
  demo?: "people" | "payment" | "settled";
};

const STEPS: Step[] = [
  {
    title: "Bem-vindo ao BIRION FINANCE",
    text: "Vou te levar pelas partes principais do app, mostrando cada uma na tela. Use Próximo e Voltar (ou as setas do teclado).",
    tip: "Dá para rever este tour quando quiser no botão ?.",
  },
  {
    route: "/ajustes/pessoas",
    targets: ["list-participants"],
    title: "O que é uma pessoa",
    text: "Pessoa é cada integrante que entra nas contas: quem paga alguma coisa e com quem ela é dividida. As dívidas são sempre entre pessoas.",
    demo: "people",
    tip: "Pessoa não é o mesmo que login: sua mãe pode ser uma pessoa sem nunca abrir o app. Quem entra pelo convite (Ajustes → Acesso) vira uma pessoa ligada à própria conta.",
  },
  {
    route: "/transacoes/nova",
    targets: ["tx-kind"],
    title: "Escolha o tipo",
    text: "Despesa é algo que foi pago; Receita, dinheiro que entrou; Empréstimo, quando alguém fica devendo tudo; Acerto, o pagamento de uma dívida.",
  },
  {
    route: "/transacoes/nova",
    targets: ["tx-card"],
    title: "Foi no cartão?",
    text: "Escolha o cartão de crédito e o lançamento entra na fatura certa. Aparecem só os cartões de quem pagou.",
    tip: "Ainda sem cartão? O link aqui leva para cadastrar.",
  },
  {
    route: "/transacoes/nova",
    targets: ["tx-repeat"],
    title: "Uma vez, parcelado ou todo mês",
    text: "Parcelado divide o valor total em parcelas mensais (ex.: notebook em 10x). Todo mês repete o valor sem data para acabar, até você parar.",
  },
  {
    route: "/transacoes/nova",
    targets: ["tx-split"],
    title: "Quem deveria pagar",
    text: "“Quem pagou” é quem tirou o dinheiro do bolso; aqui você marca de quem é a conta. Uma pessoa só: ela deve tudo para quem pagou. Várias: cada uma deve a sua parte.",
  },
  {
    route: "/transacoes/nova",
    targets: ["tx-impact"],
    title: "Veja o efeito antes de salvar",
    text: "Este quadro mostra, enquanto você preenche, o que o lançamento muda: quem fica devendo para quem, em qual fatura entra, onde soma no painel e se fica pendente.",
    tip: "Mude quem pagou, a divisão ou o cartão e veja o quadro mudar junto.",
  },
  {
    route: "/cartoes",
    targets: ["cards-stats", "cards-intro", "cards"],
    title: "Cartões e faturas",
    text: "Cada pessoa tem os próprios cartões, até 3, e só ela vê os seus. Cadastre com o dia de fechamento e acompanhe a fatura, o vencimento e quanto cada pessoa deve daquela fatura.",
    tip: "Perto do fechamento ou do vencimento, o app avisa o dono do cartão.",
  },
  {
    route: "/dividas",
    targets: ["debts"],
    title: "Dívidas",
    text: "Aqui você vê quanto te devem e quanto você deve, e, embaixo, o extrato de cada pessoa com tudo o que formou a dívida.",
  },
  {
    route: "/dividas",
    targets: ["debts-pay"],
    title: "Registrar pagamento",
    text: "Use quando o dinheiro passou de verdade de uma pessoa para a outra (Pix, dinheiro, transferência). O app cria um Acerto com o valor e a dívida diminui ou zera.",
    demo: "payment",
    tip: "Pagou só uma parte? Troque o valor antes de salvar. O pagamento fica no histórico.",
  },
  {
    route: "/dividas",
    targets: ["debts-settle"],
    title: "Acertado",
    text: "Tira um lançamento específico da conta sem registrar dinheiro nenhum. Use quando aquilo já foi resolvido de outro jeito: foi pago antes de vocês usarem o app, ou combinaram que não precisa pagar.",
    demo: "settled",
    tip: "Na dúvida: o dinheiro passou de mão? Registrar pagamento. Só quer tirar da conta? Acertado.",
  },
  {
    route: "/painel",
    targets: ["dash-debts"],
    title: "Quem deve para quem",
    text: "No painel, este bloco resume as dívidas em frases simples, como “Clara te deve R$ 30,00”, com o mesmo botão Registrar pagamento.",
  },
  {
    route: "/painel",
    targets: ["dash-filters"],
    title: "Filtros",
    text: "Escolha período, pessoa, categoria ou cartão para ver os gastos, entradas e pendências só daquilo.",
  },
  {
    route: "/importar",
    targets: ["import-file"],
    title: "Importe o extrato",
    text: "Traga o OFX ou CSV do banco, inclusive a fatura do cartão. O que já foi importado não se repete, e o pagamento da fatura vem desmarcado.",
  },
  {
    targets: ["help"],
    title: "Sempre que precisar",
    text: "Este botão ? abre o tour de novo. Para os detalhes de cada parte, veja Como funciona no menu com o seu nome.",
  },
];

const SEEN_KEY = "bf-tour-seen";
const OPEN_EVENT = "bf-open-tour";
const SEEN_EVENT = "bf-tour-seen-change";
const PAD = 8;

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

/** Botão ? que abre o tour (pode haver mais de um na tela; o tour é um só). */
export function HelpButton({ className = "icon-btn help-btn" }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      data-tour="help"
      aria-label="Tutorial: como usar o app"
      title="Tutorial: como usar o app"
    >
      <CircleHelp size={18} strokeWidth={1.8} />
    </button>
  );
}

type Box = { top: number; left: number; width: number; height: number };

/** Miniaturas que imitam as telas reais, para explicar mesmo sem dados. */
function Demo({ kind }: { kind: NonNullable<Step["demo"]> }) {
  if (kind === "people") {
    return (
      <div className="tour-demo" aria-label="Exemplo de pessoas">
        <div className="tour-demo-row">
          <span className="tour-demo-avatar">F</span>
          <span className="grow">Felipe</span>
          <span className="tour-demo-tag">tem login</span>
        </div>
        <div className="tour-demo-row">
          <span className="tour-demo-avatar">C</span>
          <span className="grow">Clara</span>
          <span className="tour-demo-tag">tem login</span>
        </div>
        <div className="tour-demo-row">
          <span className="tour-demo-avatar">M</span>
          <span className="grow">Mãe</span>
          <span className="tour-demo-tag muted">sem login</span>
        </div>
        <p className="tour-demo-caption">As três podem pagar, dividir e dever. Só quem tem login entra no app.</p>
      </div>
    );
  }
  if (kind === "payment") {
    return (
      <div className="tour-demo" aria-label="Exemplo de Registrar pagamento">
        <div className="tour-demo-row">
          <span className="grow">Clara te deve</span>
          <strong className="pos">R$ 30,00</strong>
          <span className="tour-demo-btn">Registrar pagamento</span>
        </div>
        <p className="tour-demo-arrow">
          <ArrowDown size={14} /> Clara te mandou R$ 30,00 no Pix
        </p>
        <div className="tour-demo-row">
          <span className="grow">Acerto: Clara pagou para você</span>
          <strong>R$ 30,00</strong>
        </div>
        <div className="tour-demo-row">
          <span className="grow">Clara te deve</span>
          <strong>R$ 0,00 ✓</strong>
        </div>
      </div>
    );
  }
  return (
    <div className="tour-demo" aria-label="Exemplo de Acertado">
      <div className="tour-demo-row">
        <span className="grow">Mercado (pago antes do app)</span>
        <strong className="pos">+R$ 30,00</strong>
        <span className="tour-demo-btn ghost">
          <Check size={12} /> Acertado
        </span>
      </div>
      <p className="tour-demo-arrow">
        <ArrowDown size={14} /> marcado como acertado
      </p>
      <div className="tour-demo-row">
        <span className="grow tour-demo-done">Mercado</span>
        <span className="tour-demo-tag">Acertado · fora da conta</span>
      </div>
      <p className="tour-demo-caption">Nenhum pagamento é criado; o lançamento só deixa de contar como dívida.</p>
    </div>
  );
}

export function Tutorial({ autoOpen = true }: { autoOpen?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const seen = useSyncExternalStore(subscribe, seenSnapshot, () => true);
  const [manual, setManual] = useState(false);
  const [step, setStep] = useState(0);
  // Resultado da busca da área, carimbado com o passo e a página a que se refere.
  const [found, setFound] = useState<{ key: string; box: Box | null; done: boolean }>({ key: "", box: null, done: false });
  const card = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 360, h: 240 });
  const open = manual || (autoOpen && !seen);
  const s = STEPS[step];
  const last = STEPS.length - 1;
  const key = `${step}|${pathname}`;
  const box = found.key === key ? found.box : null;
  const searching = !!s.targets && !(found.key === key && found.done);

  useEffect(() => {
    const onOpen = () => {
      setStep(0);
      setManual(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    setManual(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* sem armazenamento: só não lembra que já viu */
    }
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, []);

  // Leva até a página do passo.
  useEffect(() => {
    if (open && s.route && pathname !== s.route) router.push(s.route);
  }, [open, s.route, pathname, router]);

  // Procura a área (a página pode estar carregando), rola até ela e acompanha rolagem e tamanho da tela.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let tries = 0;
    let el: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => {
      if (!el || !alive) return;
      const r = el.getBoundingClientRect();
      setFound({ key, box: { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }, done: true });
    };
    const onMove = () => measure();
    const look = () => {
      if (!alive) return;
      const onRightPage = !s.route || pathname === s.route;
      el = onRightPage ? findTarget(s.targets) : null;
      if (el) {
        // Área alta: rola até o topo, para sobrar espaço para o balão embaixo.
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.45;
        el.scrollIntoView({ block: tall ? "start" : "center", behavior: "instant" as ScrollBehavior });
        requestAnimationFrame(measure);
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        return;
      }
      if (!s.targets || (onRightPage && tries++ > 40)) {
        // Área não existe nesta tela: o balão fica no centro.
        setFound({ key, box: null, done: true });
        return;
      }
      timer = setTimeout(look, 100);
    };
    timer = setTimeout(look, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, key, pathname, s.route, s.targets]);

  // Espaço extra no fim da página enquanto o tour está aberto, para dar para rolar
  // a área até o topo mesmo em páginas curtas.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("tour-open");
    return () => document.body.classList.remove("tour-open");
  }, [open]);

  // Se o balão não couber nem embaixo nem em cima da área, rola a página para a área subir
  // e abrir espaço embaixo (uma vez por passo).
  const nudged = useRef("");
  useEffect(() => {
    if (!open || !box || nudged.current === key) return;
    const vh = window.innerHeight;
    const fitsBelow = box.top + box.height + 12 + cardSize.h <= vh - 16;
    const fitsAbove = box.top - 12 - cardSize.h >= 16;
    if (fitsBelow || fitsAbove) return;
    if (box.height + cardSize.h + 100 > vh) return;
    nudged.current = key;
    window.scrollBy({ top: box.top - 72, behavior: "instant" as ScrollBehavior });
  }, [open, box, cardSize.h, key]);

  // Tamanho do balão, para posicionar sem sair da tela.
  useEffect(() => {
    if (!open || !card.current) return;
    const ro = new ResizeObserver(([e]) => setCardSize({ w: e.contentRect.width, h: e.target.getBoundingClientRect().height }));
    ro.observe(card.current);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setStep((x) => Math.min(last, x + 1));
      else if (e.key === "ArrowLeft") setStep((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, last]);

  if (!open) return null;

  // Balão: embaixo da área se couber; senão em cima; sem área, no centro.
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  let cardStyle: CSSProperties;
  if (box) {
    const w = Math.min(380, vw - 32);
    const h = cardSize.h;
    const left = Math.min(Math.max(16, box.left), vw - w - 16);
    const below = box.top + box.height + 12;
    const above = box.top - 12 - h;
    const sideTop = Math.min(Math.max(16, box.top), vh - h - 16);
    const rightSpace = vw - (box.left + box.width) - 28;
    const leftSpace = box.left - 28;
    if (below + h <= vh - 16) cardStyle = { position: "fixed", top: below, left, width: w };
    else if (above >= 16) cardStyle = { position: "fixed", top: above, left, width: w };
    else if (rightSpace >= 300) cardStyle = { position: "fixed", top: sideTop, left: box.left + box.width + 12, width: Math.min(w, rightSpace) };
    else if (leftSpace >= 300) cardStyle = { position: "fixed", top: sideTop, left: Math.max(16, box.left - 12 - Math.min(w, leftSpace)), width: Math.min(w, leftSpace) };
    // Sem espaço livre (celular com área alta): balão no rodapé, sobre a parte de baixo da área.
    else cardStyle = { position: "fixed", top: Math.max(16, vh - h - 16), left, width: w };
  } else {
    const w = Math.min(420, vw - 32);
    cardStyle = { position: "fixed", top: Math.max(16, (vh - cardSize.h) / 2), left: (vw - w) / 2, width: w };
  }

  return createPortal(
    <div className="tour-layer" aria-live="polite">
      {box ? (
        <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden />
      ) : (
        <div className="tour-dim" aria-hidden />
      )}
      <div ref={card} tabIndex={-1} className="tour-card" style={cardStyle} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
        <div className="tour-card-head">
          <span className="tour-count">
            {step + 1} de {STEPS.length}
          </span>
          <button type="button" className="icon-btn tour-close" onClick={close} aria-label="Fechar tutorial">
            <X size={16} />
          </button>
        </div>
        <h2 id="tour-title">{s.title}</h2>
        <p id="tour-text" className="tour-text">
          {searching ? "Abrindo…" : s.text}
        </p>
        {s.demo && !searching && <Demo kind={s.demo} />}
        {s.tip && !searching && <p className="tour-tip">{s.tip}</p>}
        <div className="tour-progress" aria-hidden>
          <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="tour-nav">
          {step > 0 ? (
            <button type="button" className="btn ghost small" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={15} /> Voltar
            </button>
          ) : (
            <button type="button" className="btn ghost small" onClick={close}>
              Pular
            </button>
          )}
          {step < last ? (
            <button type="button" className="btn primary small" onClick={() => setStep(step + 1)}>
              Próximo <ArrowRight size={15} />
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
