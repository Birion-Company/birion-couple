# Relatório: o que está confuso ou pouco didático no Birion Couple

Levantado em 13/11/2026, depois das correções de privacidade, acerto e "Nós dois".
Base: o texto real das telas nos testes (computador e celular) e a tela de Ajuda.
Nada aqui foi alterado ainda. Cada item tem a proposta.

## 1. Mesma palavra para coisas diferentes (o mais confuso)

| # | Onde | Problema | Proposta |
|---|------|----------|----------|
| 1.1 | "Acerto" | É ao mesmo tempo o **menu** (quem deve a quem), o **tipo de lançamento** (dinheiro que passou de um para o outro), o **"Acerto do mês"** no Nós dois e o **status "A acertar"**. A pessoa não sabe se "acerto" é a dívida ou o pagamento. | Menu e Nós dois: **"Quem deve"**. Tipo de lançamento: **"Pagamento entre vocês"**. Status: **"Em aberto"** / **"Pago"**. |
| 1.2 | "Nós" | Em Ajustes, "Nós" é a seção do nome do casal, do convite e do histórico; no menu, "Nós dois" é o painel do casal; no histórico existe uma aba "Nós". | Em Ajustes: **"Casal"**. No histórico: **"Casal"** e **"Lançamentos"**. "Nós dois" só para o painel. |
| 1.3 | "Movimentação" | É o nome da lista de lançamentos e também de uma aba do histórico (que é outra coisa: o que mudou). | Aba do histórico: **"Alterações"**. |
| 1.4 | Registrar um pagamento | Existem dois caminhos com nomes diferentes: **"Recebi / Paguei"** dentro do lançamento e **"Registrar pagamento"** na tela de Acerto, que abre um formulário de "Acerto" e abate das contas mais antigas. O resultado é o mesmo tipo de coisa, mas parecem funções diferentes. | Deixar o mesmo nome nos dois ("Registrar pagamento") e explicar em uma linha: "abate desta conta" × "abate das contas mais antigas". |

## 2. Números que não batem entre telas (sem estar errados, mas parecem)

| # | Onde | Problema | Proposta |
|---|------|----------|----------|
| 2.1 | Início × Nós dois × Acerto | O Início mostra "Você deve a outras pessoas" (tudo, inclusive mãe e outros meses); o Nós dois mostra o "Acerto do mês" (só entre o casal e só no mês); a tela de Acerto mostra "todos os meses". São três totais diferentes com nomes parecidos. | Um **saldo total** fixo no topo do Início: "A pagar R$ X · A receber R$ Y" (tudo, todos os meses), e cada tela dizer de onde vem o número: "só deste mês", "só entre vocês". |
| 2.2 | Início: "Saldo final sem acertar" / "Saldo final com tudo acertado" | Termos técnicos; não fica claro que "com tudo acertado" é "se todo mundo te pagar e você pagar todo mundo". | "Se ninguém pagar ninguém: R$ X" e "Depois que todos acertarem: R$ Y". |
| 2.3 | Nós dois: "Quem pagou e quem consumiu" | "Consumiu" soa estranho para dinheiro. | "Quem pagou e de quem era a parte". |

## 3. Textos que ficaram desatualizados depois das mudanças de hoje

| # | Onde | Problema | Proposta |
|---|------|----------|----------|
| 3.1 | Ajuda → "Início" | Diz "o mês dos dois", mas o Início agora é **só seu**. | "O seu mês: o que entrou, saiu e o que você deve ou tem a receber." |
| 3.2 | Ajuda | Não explica a tela **Nós dois** nem a regra de privacidade (o que o outro vê). | Entrada "Nós dois: só o que vocês dividem" e "O que o seu par vê: só os lançamentos em que ele tem parte". |
| 3.3 | Formulário de lançamento | O campo que decide se é pessoal ou do casal se chama **"De quem é esse dinheiro"** / "Quem deveria pagar". Não fica claro que marcar o par é o que coloca o gasto no Nós dois. | Atalho no topo: **"Só meu" · "Dos dois" · "Outra pessoa"**, preenchendo a divisão. |

## 4. Fluxos que confundem

| # | Onde | Problema | Proposta |
|---|------|----------|----------|
| 4.1 | Movimentação | Pessoal e do casal misturados na mesma lista, sem filtro direto. | Filtro fixo **"Todos · Só meus · Dos dois"**. |
| 4.2 | Pagar a mais | Ao pagar mais do que deve, abre um quadro "Excedente" com opções; bom, mas a opção "Abater na próxima parcela" aparece mesmo em lançamento que não se repete. | Só mostrar "Abater na próxima" quando o lançamento é parcelado ou todo mês. |
| 4.3 | Foto de perfil | A foto é cortada num quadrado pelo centro, sem a pessoa ver antes. | Prévia com ajuste (arrastar e zoom) antes de salvar. |
| 4.4 | Formulário de Acerto aberto pelo "Novo" | Precisa escolher "Para quem" (pelo atalho da tela de Acerto já vem preenchido). Sem isso dá o erro "Escolha para quem foi o acerto". | No casal, já vir preenchido com o par. |

## 5. Celular (corrigido hoje)

- Nós dois ficava mais largo que a tela (cards e rostos cortados): **corrigido**.
- Selo "Você deve R$ 6.172,83" cortava o valor no lançamento "Th": **corrigido**.
- Valor do eixo do gráfico ("R$ 6,2 mil") cortado: **corrigido**.
- Botão de categoria "desfocado" ao lançar: **não reproduzido** (precisa de print e do aparelho).

## Prioridade sugerida

1. Saldo total no Início (2.1) e atalho "Só meu / Dos dois" (3.3): é o que mais resolve a confusão do dia a dia.
2. Renomear "Acerto" (1.1) e "Nós" em Ajustes (1.2).
3. Ajuda atualizada (3.1, 3.2) e filtro na Movimentação (4.1).
4. O resto.
