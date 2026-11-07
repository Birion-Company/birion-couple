# BIRIUN FINANCE

Finanças da família em um só lugar: quem pagou, quem deve e o que ainda está pendente.

Feito para qualquer família ou grupo (casa compartilhada, viagem, república). **Tudo se configura pela interface, sem mexer em código**: pessoas, categorias, projetos, status, regras de categorização, modelos de importação e quem tem acesso.

## O que faz

- **Conta por família.** Quem cria a conta administra; os outros entram por um link de convite. Cada família só vê os próprios dados.
- **Pessoas** que dividem as contas, com ou sem login (mãe, namorada, colegas de casa…).
- **Lançamentos** de despesa, receita ou acerto entre pessoas, divididos em partes iguais ou com valores diferentes.
- **Status configuráveis.** Os nomes são livres; cada status tem um significado para os saldos:
  - *Pendente*: ainda não foi pago; aparece em Pendências e não entra no saldo.
  - *Pago, a acertar* (ex.: "Pago por mim"): alguém pagou e os outros devem a sua parte.
  - *Acertado* (ex.: "Reembolsado"): já foi acertado; sai do saldo.
- **Importação de OFX e CSV** de qualquer banco, com prévia, escolha das colunas, modelos salvos por banco, categorização automática por regras e detecção do que já foi importado.
- **Painel** com o saldo de cada pessoa (deve / tem a receber), sugestão de como acertar, pendências e gastos por categoria.
- **Filtros** por pessoa, categoria, projeto, status e período, guardados na URL.
- **Pensado para celular**: navegação inferior, botões grandes, instalável na tela inicial.

## Como os saldos são calculados

Entram só lançamentos com status do tipo *Pago, a acertar*.

- Despesa ou acerto: quem pagou adianta o valor; cada pessoa da divisão deve a sua parte.
- Receita: quem recebeu ficou com dinheiro que é de todos e deve a parte de cada um.

Saldo positivo = tem a receber. Negativo = deve. A lógica está em `src/lib/balances.ts`, com testes em `tests/lib.test.ts`.

## Tecnologia

- [Next.js 16](https://nextjs.org) (App Router, Server Actions) e React 19
- PostgreSQL via [Netlify Database](https://docs.netlify.com) com [Drizzle ORM](https://orm.drizzle.team)
- Leitura de arquivos: [Papa Parse](https://www.papaparse.com) (CSV) e [ofx-data-extractor](https://www.npmjs.com/package/ofx-data-extractor) (OFX)
- Sessão em cookie assinado ([jose](https://github.com/panva/jose)), senhas com bcrypt, validação com Zod

## Rodar localmente

Requer Node 22+.

```bash
npm install
cp .env.example .env.local
npm run db:dev      # sobe um Postgres local e aplica as migrações (deixe aberto)
npm run dev         # em outro terminal: http://localhost:3000
```

Verificações:

```bash
npm test            # lógica de saldos, valores, OFX, CSV e deduplicação
npm run typecheck
npm run lint
```

## Banco de dados

O schema fica em `src/db/schema.ts`. Depois de mudar o schema:

```bash
npm run db:generate   # cria uma nova migração em netlify/database/migrations
```

As migrações são aplicadas automaticamente pelo Netlify a cada deploy. Nunca edite uma migração que já foi aplicada; crie uma nova.

## Deploy

O site é publicado no Netlify a cada push na `main`. Variável de ambiente obrigatória em produção:

- `AUTH_SECRET`: valor longo e aleatório usado para assinar as sessões.

O Netlify cria o banco e define a conexão sozinho.
