import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Como funciona" };

type Item = { term: string; text: React.ReactNode };
type Section = { id: string; title: string; intro?: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    id: "comecar",
    title: "Para começar",
    items: [
      { term: "1. Convide", text: <>Em <Link href="/ajustes">Ajustes → Nós</Link>, toque em Convidar parceiro(a) e mande o link.</> },
      { term: "2. Cartões", text: <>Escolha seus cartões em <Link href="/cartoes">Contas → Cartões</Link>, com o dia de fechar e de vencer.</> },
      { term: "3. Lance", text: <>Use o botão <strong>Novo lançamento</strong> ou <Link href="/importar">importe o extrato</Link> do banco.</> },
    ],
  },
  {
    id: "menu",
    title: "Onde fica cada coisa",
    items: [
      { term: "Início", text: "O mês dos dois. Arraste os blocos em Organizar e use Página larga se quiser mais espaço." },
      { term: "Gastos", text: "Tudo o que foi lançado no mês, com busca e filtros." },
      { term: "Acerto", text: "Quem deve a quem. Quando acertarem, registre o pagamento." },
      { term: "Metas", text: "O que querem juntar e até quando." },
      { term: "Contas", text: "Saldo dos bancos e as faturas dos cartões." },
      { term: "A identificar", text: "Só aparece quando falta algo (categoria, quem pagou, quem deve). Complete e sai da lista." },
    ],
  },
  {
    id: "dividir",
    title: "Dividir um gasto",
    items: [
      { term: "Despesa", text: "Diga quem pagou e a parte de cada um. Quem não pagou fica devendo a sua parte." },
      { term: "Receita", text: "Dinheiro que entra. Fica “a receber” até você tocar em Recebi." },
      { term: "Parcelado e todo mês", text: "Um lançamento por mês, de hoje para frente. Para parar de repetir, abra o lançamento." },
      { term: "Recebi / Paguei", text: "Abate a dívida. Pagou menos? O resto continua. Pagou mais? A diferença vira lucro." },
    ],
  },
  {
    id: "ajustes",
    title: "Ajustes",
    items: [
      { term: "Nós", text: "Nome do casal, moeda, o convite, se um confirma os gastos do outro e o histórico." },
      { term: "Categorias", text: "Ordem, limite por mês (com aviso aos 80% e ao passar) e regras que categorizam sozinhas." },
      { term: "Importação e exportação", text: "Extrato do banco (OFX ou CSV) sem repetir; o mês em planilha ou PDF." },
      { term: "Perigo", text: "Apagar seus dados ou a conta. Não tem volta." },
    ],
  },
  {
    id: "privado",
    title: "Meu, seu, nosso",
    items: [
      { term: "Cartões e contas", text: "São de quem cadastrou: o outro não vê saldo nem fatura." },
      { term: "Gastos", text: "Cada um vê o que lançou, o que pagou e o que tem parte." },
    ],
  },
];

/** Causa → efeitos: como uma ação mexe nas outras partes do app. */
const CONNECTIONS: { cause: string; effects: string[] }[] = [
  { cause: "Gasto dividido", effects: ["Quem não pagou passa a dever", "Soma nos gastos do mês"] },
  { cause: "Compra no cartão", effects: ["Entra na fatura do mês em que vence"] },
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
          <p className="muted">Em poucas linhas.</p>
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
