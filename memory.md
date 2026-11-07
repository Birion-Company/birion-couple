# Workspace Memory

Durable, non-secret context for **BIRIUN FINANCE**.

## Objective

Área: pessoal. Sistema web de finanças para várias pessoas de uma família: participantes, transações manuais ou importadas (OFX/CSV), status configuráveis (pendente, pago por mim, reembolsado), categorias, projetos e dashboard de quanto cada pessoa deve ou tem a receber. Tudo configurável pela interface, para qualquer família. Next.js + PostgreSQL (Netlify Database), deploy no Netlify, repositório público no GitHub. Só a branch main; outras branches apenas com autorização do usuário.

## Durable decisions

- Gartrol is the source of truth for cards, claims, leases, deliveries, commits, and evidence.
- Agents deliver cards as `done`; only humans validate or reject them. Pull-request review or merge is not a prerequisite for delivery.
- Repository-specific permission: the owner requires every commit to go directly to `main` (push to `main` is allowed). Create other branches only with the owner's explicit authorization.
- Stable commit scope: `finance`.
- Site: https://biriun-finance.netlify.app (Netlify site id 6da5c71e-679c-4a5d-a737-c85433e789ed), deploy automático a cada push na `main`. Repo: https://github.com/Gabbr1el/biriun-finance (público).
- O `@netlify/plugin-nextjs` precisa estar declarado em `netlify.toml`; sem ele o site (criado pela API) sobe como estático e dá 404.
- Banco: Netlify Database + Drizzle (`drizzle-orm/netlify-db`, versões `@beta`). Migrações em `netlify/database/migrations`, aplicadas pelo deploy; nunca editar uma já aplicada.
- Local: `npm run db:dev` + `.env.local` com `NETLIFY_DB_DRIVER=server` (sem isso o adaptador tenta o driver serverless e falha com "fetch failed").
- `AUTH_SECRET` fica só nas variáveis do Netlify (segredo); nunca no repositório.

## Conventions

- Read `AGENTS.md` before editing.
- Use Conventional Commits with a mandatory stable scope: `type(scope): imperative summary`.
- Follow Trunk-Based Development with `main` as the only trunk and short-lived topic branches.
- Treat one pull request as one coherent delivery; batch related micro-adjustments and keep commits atomic.
- Run targeted checks while iterating and the required full gate once before integration; require human review for high-risk changes.
- Use `gh --body-file` for multiline pull-request Markdown and verify the published body.
- Record only concise facts that remain useful across sessions.
- Never store credentials, lease tokens, raw transcripts, or temporary status.
