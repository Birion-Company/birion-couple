# Birion Couple na Hostinger (plano com aplicações Node.js)

O servidor desse plano tem uma biblioteca do sistema (glibc) antiga e **não consegue compilar o Next 16**. Por isso o app é
compilado no GitHub (Linux novo) e a Hostinger só **executa** o pacote pronto. O banco é um **Postgres externo** (o plano só tem MySQL).

## Como funciona

1. A cada push na `main`, o GitHub Actions (`.github/workflows/hostinger.yml`) compila com `BUILD_STANDALONE=1` e publica o pacote
   pronto na branch **`hostinger`** (só `server.js`, `.next/static`, `public` e as migrações).
2. Na Hostinger, o aplicativo Node.js é ligado à branch `hostinger`, **sem etapa de build**, com o comando de início `node server.js`
   (ou `npm start`).
3. Ao ligar, o app aplica sozinho as migrações pendentes no banco (`DATABASE_URL`). `MIGRATE_ON_START=0` desliga.
4. Os avisos de fatura rodam de hora em hora dentro do próprio app (não precisa de cron).

## Variáveis de ambiente (painel da Hostinger)

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres externo (ex.: Neon): `postgres://usuário:senha@host/banco?sslmode=require` |
| `AUTH_SECRET` | segredo longo e aleatório (assina o login) |
| `URL` | `https://couple.birion.com.br` |
| `RESEND_API_KEY` | envio dos códigos por e-mail |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | notificações no celular (opcional; ver `avisos-no-celular.md`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | login com Google (opcional; autorizar `https://couple.birion.com.br/api/auth/google/callback`) |
| `PORT` | a porta que a Hostinger indicar (o `server.js` lê esta variável) |
| `DATABASE_POOL_MAX` | conexões abertas ao banco (padrão 5; reduza se o banco limitar) |

## Testado

Pacote montado como acima, rodando contra um Postgres vazio: as 45 migrações aplicaram do zero, o cadastro, o código por e-mail,
a confirmação e o painel funcionaram. **Não foi testado no servidor da Hostinger.**

## Limitações

- Memória e processos do plano compartilhado não são detalhados pela Hostinger: acompanhe o uso depois de ligar.
- Sem Docker nem acesso root. Para algo mais robusto, um VPS (KVM 1 ou 2) roda o mesmo pacote sem essas restrições.
