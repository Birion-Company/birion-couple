# Birion Couple na Hostinger (plano com aplicações Node.js)

O servidor desse plano tem uma biblioteca do sistema (glibc) antiga e **não consegue compilar o Next 16**. Por isso o app é
compilado no GitHub (Linux novo) e a Hostinger só **executa** o pacote pronto. O banco é o **MySQL/MariaDB do próprio plano** (criado no hPanel ou pela API).

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
| `DATABASE_URL` | MySQL do plano: `mysql://usuário:senha@127.0.0.1:3306/banco` (use 127.0.0.1, não `localhost`) |
| `AUTH_SECRET` | segredo longo e aleatório (assina o login) |
| `URL` | `https://couple.birion.com.br` |
| `RESEND_API_KEY` | envio dos códigos por e-mail |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | notificações no celular (opcional; ver `avisos-no-celular.md`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | login com Google (opcional; autorizar `https://couple.birion.com.br/api/auth/google/callback`) |
| `PORT` | a porta que a Hostinger indicar (o `server.js` lê esta variável) |
| `DATABASE_POOL_MAX` | conexões abertas ao banco (padrão 5; reduza se o banco limitar) |

## Testado

Pacote montado como acima, contra um MariaDB vazio: a migração aplicou do zero e o cadastro, o convite, lançamentos, parcelas,
importação e as telas funcionaram. As telas com os dados reais de teste (importados do Postgres antigo) saíram iguais às do app antigo.

## Limitações

- Memória e processos do plano compartilhado não são detalhados pela Hostinger: acompanhe o uso depois de ligar.
- Sem Docker nem acesso root. Para algo mais robusto, um VPS (KVM 1 ou 2) roda o mesmo pacote sem essas restrições.

## Backup e troca de banco (JSON)

`npm run db:export -- <postgres-url> arquivo.json` lê o banco **antigo (Postgres)** e `npm run db:import -- <mysql-url> arquivo.json`
grava no MySQL (as tabelas já devem existir: o app cria ao ligar). O JSON é independente de banco e serve de cópia de segurança.
Use `--substituir` para esvaziar as tabelas antes de importar. Foi assim que os dados saíram do Postgres local para a Hostinger.
