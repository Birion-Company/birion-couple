"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { markTourSeen } from "@/app/actions/profile";
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
  {
    chapter: "Começo",
    title: "Bem-vindo ao Birion Couple",
    text: "As finanças de vocês dois em poucos toques: quem pagou, quem deve e para onde vai o dinheiro. Este guia leva **um minuto**. Dá para sair quando quiser e voltar pelo botão **Tutorial**.",
  },
  {
    chapter: "Menu",
    targets: ["nav-home"],
    title: "Início",
    text: "O **resumo do mês**: saldo inicial, receitas, despesas e saldo final, com o que ainda falta acertar entre vocês. Use as setas da barra de cima para trocar de mês.",
  },
  {
    chapter: "Menu",
    targets: ["nav-nos"],
    title: "Nós dois",
    text: "O mês **dos dois juntos**: quanto cada um pagou e consumiu, onde mais gastaram e as **metas do casal**.",
  },
  {
    chapter: "Menu",
    targets: ["nav-mov"],
    title: "Movimentação",
    text: "Tudo o que entrou e saiu, com **busca** e **filtros**. Toque num lançamento para editar.",
  },
  {
    chapter: "Menu",
    targets: ["nav-acerto"],
    title: "Acerto",
    text: "**Quem deve a quem.** Quando pagarem um ao outro, registre aqui com **Recebi** ou **Paguei**.",
  },
  {
    chapter: "Menu",
    targets: ["nav-cartoes"],
    title: "Cartões",
    text: "Escolha o seu cartão e veja a **fatura** que falta pagar (com a borda tracejada) e a que está aberta.",
  },
  {
    chapter: "Menu",
    targets: ["nav-metas"],
    title: "Metas",
    text: "Quanto querem juntar e até quando. O app diz **quanto guardar por mês**.",
  },
  {
    chapter: "Lançar",
    targets: ["new-fab", "tx-new"],
    title: "Novo lançamento",
    text: "O botão **+** cria um lançamento em qualquer tela: o **tipo** (despesa, receita, dívida ou acerto), o **valor**, **quem pagou** e **quem divide**.",
  },
  {
    chapter: "Ajustes",
    route: "/ajustes",
    targets: ["settings-tabs"],
    title: "Ajustes",
    text: "Em **Nós** fica o convite do seu par. Em **Aparência**, as cores, claro ou escuro e a largura das páginas. Também há **Categorias**, **Importação** do extrato do banco e **Exportação**.",
  },
  {
    chapter: "Pronto",
    title: "É isso",
    text: "Comece lançando o primeiro gasto. O botão **Tutorial**, na barra de cima, mostra esta volta de novo.",
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
            ["Nós", "casal e convite"],
            ["Categorias", "limite e regras"],
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

/** autoOpen: abre sozinho (só no primeiro acesso da conta; quem decide é o servidor). */
export function Tutorial({ autoOpen = false }: { autoOpen?: boolean }) {
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
    // Guarda na conta: não abre sozinho de novo, nem em outro aparelho.
    void markTourSeen().catch(() => {});
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
