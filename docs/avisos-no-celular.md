# Ligar as notificações no celular e os avisos de fatura (produção)

Sem estas 4 variáveis no Netlify, o site publicado não manda notificação no celular nem avisa de fatura fechando ou vencendo. Elas são segredos: quem cadastra é a pessoa dona da conta do Netlify, direto no painel. Não cole os valores em conversa nem no repositório.

## 1. Gerar as chaves (no seu computador)

Num terminal seu (não dentro do Claude Code):

```bash
npx web-push generate-vapid-keys
openssl rand -base64 32
```

O primeiro mostra uma **Public Key** e uma **Private Key**. O segundo mostra um texto aleatório, que é o **CRON_SECRET**.

## 2. Cadastrar no Netlify

Netlify → site **birion-finance** → **Site configuration → Environment variables → Add a variable**:

| Variável | Valor | Marcar como segredo |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | a Public Key | não (ela vai para o navegador) |
| `VAPID_PRIVATE_KEY` | a Private Key | sim |
| `VAPID_SUBJECT` | `mailto:felipegabrielsr03@gmail.com` | não |
| `CRON_SECRET` | o texto do `openssl` | sim |

## 3. Publicar

A chave pública entra no site na hora de montar, então é preciso publicar de novo depois de cadastrar.

## 4. Conferir

1. No celular, abra birion.com.br → Meu perfil → Notificações → **Ligar**. No iPhone, primeiro adicione o site à Tela de Início.
2. Peça para outra pessoa da família lançar algo com você: a notificação deve chegar.
3. Os avisos de fatura rodam todo dia às 8h (Brasília), pela função agendada `alertas-fatura`. Em Netlify → **Logs → Functions → alertas-fatura** dá para ver a última execução.
