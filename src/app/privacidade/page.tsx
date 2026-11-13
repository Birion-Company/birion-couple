import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Quais dados o Birion Couple guarda, para que servem e como pedir para apagar.",
};

const CONTATO = "felipegabrielsr03@gmail.com";
const ATUALIZADA = "11 de novembro de 2026";

/** Página pública (sem login): exigida pelo Google para o "Entrar com Google" e útil para quem usa o app. */
export default function PrivacyPage() {
  return (
    <main className="legal">
      <article className="legal-page">
        <Link href="/entrar" className="legal-brand">
          { }
          <i className="blogo" aria-hidden /> <span>Couple</span>
        </Link>
        <h1>Política de privacidade</h1>
        <p className="legal-date">Atualizada em {ATUALIZADA}</p>

        <p>
          O Birion Couple (<strong>couple.birion.com.br</strong>) é um site para organizar finanças e dividir contas entre duas pessoas, o casal. Esta página
          explica, de forma simples, quais dados guardamos, para que usamos e como você pode pedir para apagar. Seguimos a Lei Geral de Proteção de Dados
          (LGPD, Lei 13.709/2018).
        </p>

        <h2>1. Quais dados guardamos</h2>
        <ul>
          <li>
            <strong>Da sua conta:</strong> nome, e-mail e senha (guardada só embaralhada, nunca em texto). Se você enviar, a foto de perfil.
          </li>
          <li>
            <strong>Se entrar com o Google:</strong> recebemos do Google apenas o seu <strong>nome</strong> e o seu <strong>e-mail</strong>, para criar
            ou abrir a sua conta. Não acessamos sua agenda, seus e-mails, seus arquivos nem seus contatos.
          </li>
          <li>
            <strong>O que você lança no app:</strong> despesas, receitas, dívidas, acertos, cartões (nome, dia de fechamento e de vencimento; nunca o
            número do cartão), categorias, projetos e as pessoas com quem você divide contas (nome e, se você quiser, uma foto).
          </li>
          <li>
            <strong>Extratos importados:</strong> quando você importa um arquivo OFX ou CSV do banco, guardamos só os lançamentos que você escolhe
            importar (data, descrição e valor).
          </li>
          <li>
            <strong>Avisos no celular:</strong> se você ligar as notificações, guardamos o identificador do aparelho para poder mandar os avisos.
          </li>
          <li>
            <strong>Para entrar e funcionar:</strong> um cookie de sessão (para você continuar logado) e preferências no seu navegador, como o tema claro
            ou escuro. Não usamos cookies de propaganda nem de rastreamento.
          </li>
        </ul>

        <h2>2. Para que usamos</h2>
        <ul>
          <li>Mostrar as suas finanças: quem pagou, quem deve, faturas, gastos por categoria e os próximos meses.</li>
          <li>Mostrar para o seu par só o que envolve vocês dois.</li>
          <li>Mandar e-mails necessários, como o código para criar uma senha nova, e avisos que você escolher receber.</li>
          <li>Manter o site seguro e funcionando.</li>
        </ul>
        <p>
          <strong>Não vendemos, não alugamos e não usamos seus dados para propaganda.</strong>
        </p>

        <h2>3. Quem mais vê seus dados</h2>
        <ul>
          <li>
            <strong>O seu par no app:</strong> vê os lançamentos que os envolvem (por exemplo, uma conta dividida).
          </li>
          <li>
            <strong>Empresas que fazem o site funcionar</strong>, só no necessário para isso: Netlify (hospedagem e banco de dados), Resend (envio dos
            e-mails) e Google (login com Google). Elas podem guardar os dados em servidores fora do Brasil, com as proteções exigidas pela LGPD.
          </li>
          <li>Autoridades, só quando a lei obrigar.</li>
        </ul>

        <h2>4. Por quanto tempo guardamos</h2>
        <p>
          Enquanto a sua conta existir. Em Ajustes → Perigo → Excluir meus dados, você apaga na hora tudo que lançou. Se pedir para apagar a sua conta, apagamos
          seus dados em até 30 dias, exceto o que a lei mandar guardar.
        </p>

        <h2>5. Seus direitos</h2>
        <p>
          Você pode, a qualquer momento: saber quais dados temos sobre você, corrigir (pelo próprio app, em Meu perfil), baixar uma cópia (em Ajustes →
          Exportação) e pedir para apagar a sua conta e os seus dados.
        </p>

        <h2>6. Contato</h2>
        <p>
          Para qualquer pedido sobre os seus dados, escreva para <a href={`mailto:${CONTATO}`}>{CONTATO}</a>. Respondemos em até 15 dias.
        </p>

        <h2>7. Mudanças nesta política</h2>
        <p>Se esta política mudar, a data no topo é atualizada. Mudanças importantes também aparecem dentro do app.</p>

        <p className="legal-back">
          <Link href="/entrar">← Voltar para o Birion Couple</Link>
        </p>
      </article>
    </main>
  );
}
