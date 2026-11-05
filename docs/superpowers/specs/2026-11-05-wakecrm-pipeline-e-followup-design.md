# WakeCRM · Pipeline por etapa + sinal "parado", varredura de follow-ups e revisão do admin

Data: 05/11/2026. Status: rascunho para aprovação do dono.

## 1. Intenção

Hoje "Follow-up" é uma etapa do funil, e isso mistura **onde a pessoa está** com **o fato de
ela ter parado**. O dono quer:

- etapas que reflitam o funil real, movidas também pelo **app de agendamentos** da Wake;
- um sinal **"parado"** por cima da etapa, que é o que define quem recebe follow-up (o link sem
  cadastro, o cadastro sem compra, o pagamento gerado e não pago, o interessado que não agendou,
  o aluno com horas que não agenda, o aluno sem horas para recompra);
- um **botão** para varrer todas as conversas e preparar follow-ups na hora (ex.: domingo);
- **decisão em dois níveis**: a atendente decide se sai; o **admin revisa** as decisões dela, e
  **só a revisão do admin ensina** a IA.

## 2. Decidido pelo dono (05/11/2026)

- Etapas por eventos do app: sim (cadastro, compra pendente, compra paga, aula realizada).
- Pós-compra: **Aluno com horas** (saldo > 0) e **Aluno sem horas** (saldo = 0).
- Cada `USER_LESSON_ATTENDED` = **1 hora** (dois horários = dois eventos).
- Pacote compartilhado: o saldo é do **comprador**; não importa quem usou a hora. Os eventos de
  aula chegam no nome da conta de quem comprou.
- Cota (conservador 20 / aquecido 60) limita **envios por dia**, não preparo nem decisão:
  pode-se decidir 100; os aprovados entram numa fila e saem até a cota de cada dia.
- Atendente decide se o follow-up sai; a decisão dela não altera a inteligência do motor. O admin
  revisa as decisões da atendente e a observação do admin é o que entra no aprendizado.
- Botão de varredura: o motor passa conversa a conversa, decide quem pode receber e manda as
  sugestões para a fila de aprovação.

## 3. Etapas (substituem as atuais)

| Etapa | Entra quando | Quem move |
|---|---|---|
| Novo lead | primeira mensagem do lead | motor |
| Em atendimento | equipe respondeu; conversa em curso | motor / IA |
| Link enviado | equipe enviou o link de cadastro | IA (lendo a conversa) |
| Cadastrado | `USER_CREATE_ACCOUNT` | app |
| Aguardando pagamento | `USER_HOUR_PURCHASE_CREATED` com status pendente | app |
| Aluno com horas | saldo de horas > 0 | app (compra paga / aula realizada) |
| Aluno sem horas | saldo = 0 após ter comprado | app (aula realizada) |
| Encerrado | perdido, opt-out ou "não atender" | equipe / IA |

- Etapas do app **só avançam** (um evento antigo fora de ordem não faz voltar), exceto
  `Aluno sem horas` → `Aluno com horas` em nova compra paga.
- "Agendado" e "Aula realizada" deixam de ser etapas e viram informação do lead (próxima aula,
  última aula, horas restantes). O `USER_HOUR_BOOKED` grava a próxima aula; não muda etapa.
- Eventos com `data.test === true` (ou `"true"`) nunca movem etapa.
- Mapeamento das etapas antigas para as novas na migração: Novo Lead → Novo lead; Atendimento →
  Em atendimento; Link enviado → Link enviado; Aguardando pagamento → Aguardando pagamento;
  Agendado / Aula realizada → Aluno com horas se houver venda paga vinculada, senão Em atendimento;
  Follow-up → etapa anterior registrada no histórico, senão Em atendimento; Negociação encerrada
  → Encerrado.

## 4. Saldo de horas

- Saldo do comprador = Σ `hours` das compras pagas vinculadas ao lead − nº de
  `USER_LESSON_ATTENDED` que consumiram horas dessas compras.
- O app envia `USER_LESSON_ATTENDED` (e `USER_HOUR_BOOKED`) **no nome da conta de quem comprou**
  as horas, mesmo quando quem usou o horário foi um amigo (dono, 05/11/2026). Então a hora é
  descontada do lead do próprio evento (cruzado por CPF/telefone, como as vendas); o app não
  precisa mandar o id da compra.
- Evento de aula de quem não tem saldo é registrado como "hora sem saldo" (visível em
  Configurações › Fila de eventos) e não deixa o saldo negativo.
- Estorno de compra (quando o app passar a enviar) reduz o saldo.

## 5. Sinal "parado" (quem recebe follow-up)

Um lead está **parado** quando a etapa é elegível, a última mensagem da conversa é da equipe,
passou o prazo sem resposta e não chegou evento do app depois dela. Prazos padrão
(**decisão minha**, configuráveis em Configurações):

| Etapa | Parado após | Objetivo do follow-up |
|---|---|---|
| Em atendimento | 24 h | retomar o interesse |
| Link enviado | 24 h | concluir o cadastro |
| Cadastrado | 24 h | escolher pacote e pagar |
| Aguardando pagamento | 6 h | concluir o pagamento |
| Aluno com horas | 7 dias sem aula agendada | agendar a próxima aula |
| Aluno sem horas | 15 dias após a última aula | recompra |

Novo lead e Encerrado nunca ficam parados. Opt-out, "não atender" e lead sem dono continuam fora.
O redator recebe a etapa e o objetivo para escrever o texto certo.

## 6. Varredura pelo botão

- Botão **"Buscar follow-ups agora"** (admin) na tela "Para avaliar".
- Antes de rodar: mostra quantos leads parados serão analisados e avisa que cada análise é uma
  chamada paga à OpenAI; confirmação `s/N` na tela.
- Roda porteiro + redator em todos os parados sem follow-up pendente, sem limite de cota; mostra
  progresso ("analisando 34 de 120") e o resumo (viraram sugestão / barrados com motivo).
- As sugestões vão para a fila de aprovação de cada dono do lead, como no automático.
- Só uma varredura por vez; o automático continua rodando normalmente.

## 7. Cota, fila de envio e validade

- Preparar e decidir: sem limite.
- Enviar: até a cota do modo por dia (São Paulo), na janela 8h–19h59, com o intervalo mínimo
  entre disparos já existente; ordem: maior valor esperado primeiro, depois mais antigo.
- Aprovados não enviados no dia ficam na **fila de envio** para os dias seguintes.
- Cancelamento automático de aprovado antes de sair: o lead mandou mensagem (conversa viva) ou
  chegou evento do app que muda a etapa.
- Aprovado parado na fila há mais de **3 dias** (**decisão minha**) passa de novo pelo porteiro
  antes de sair; se barrado, sai da fila com o motivo.
- A expiração às 19h59 continua só para sugestões **não decididas** (texto velho não sai sem
  alguém olhar).
- Tela "Fila de envio" (admin): aprovados pendentes, quantos saem hoje, previsão de esvaziar,
  opção de remover um item.

## 8. Decisão em dois níveis e aprendizado

- **Atendente** (dona do lead): Enviar / Não enviar, motivos e texto livre, como hoje. Libera ou
  barra o envio; **não** alimenta o prompt.
- **Admin**: tela "Revisão das decisões" com as decisões do período (texto da IA, texto
  enviado/editado, decisão e motivo da atendente). Marca **Concordo / Discordo** e escreve uma
  observação. Itens já revisados saem da lista.
- **Aprendizado**: o redator e o porteiro passam a receber no prompt só as revisões do admin
  (até N recentes, formato "sugestão → decisão da atendente → avaliação e observação do admin"),
  no lugar das avaliações das atendentes; muda a `versao_prompt`.
- O admin decidindo direto um follow-up (sem atendente) conta como decisão + revisão.

## 9. Não-objetivos

- Enviar sem aprovação humana.
- Atribuição de hora a quem usou (o saldo é do comprador).
- Mudar a gestão de aulas/agenda (é do app).

## 10. Anti-objetivos

- Follow-up para quem acabou de pagar, agendar ou se cadastrar (evento do app sempre cancela).
- Descontar hora de pessoa errada por chute.
- Furar a cota de envios em qualquer caminho (varredura incluída).
- Aprendizado vindo de decisão não revisada.

## 11. Restrições

- Migrações numeradas; etapas validadas por constraint (atualizar `leads_etiqueta_valida` e as
  views que listam etapas: `v_conversas_painel`, `v_leads_painel`, `v_relatorio_funil`).
- Eventos do app chegam pelo webhook de vendas (normalizador já reconhece o envelope `USER_*`).
- Toda decisão do motor vira linha em `eventos_automacao` no mesmo comando que muda o dado.

## 12. Fica para o construtor

- Layout das telas novas (seguir `docs/design.md`, mobile primeiro).
- Execução da varredura (tarefa no motor com progresso consultável).
- Formato exato do prompt com as revisões do admin.
