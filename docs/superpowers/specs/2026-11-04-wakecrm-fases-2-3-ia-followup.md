# WakeCRM · fases 2 e 3 · IA de volta e follow-up com aprovação

> Spec escrita em 04/11/2026 a partir do design `2026-11-03-wakecrm-motor-proprio-design.md`
> (§5.6, §7, §9.5, §10 itens 2 e 3) e dos workflows legados `docs/n8n-legado/wf-02`, `wf-03` e
> `wf-11`. Marcação: **[design]** = decidido no design; **[construtor]** = decisão desta spec,
> tomada com autonomia concedida pelo dono em 04/11/2026 e revisável.

## 1. Objetivo

Trazer de volta "o coração do CRM": transcrição de áudio, qualificador (com
`horas_estimadas`), porteiro e redator; e trocar o fluxo "abrir no WhatsApp" por uma fila de
aprovação estilo Reels em que nenhum follow-up sai sem um humano tocar "Enviar", com modos de
ritmo e cadência de envio.

Fase 2 = §3 e §4. Fase 3 = §5 a §9. Cada uma termina utilizável. Tudo roda sem adaptador do
Evolution Go, com as tarefas que dependem dele ficando ociosas (como o heartbeat da fase 1).

## 2. Cliente de IA **[construtor]**

- Sem SDK: `fetch` à API da OpenAI em `src/server/ia/openai.ts`. Chave em `OPENAI_API_KEY`
  (`.env`); sem chave, as tarefas de IA não rodam e logam `ia.sem_chave` uma vez.
- Interface `ClienteIa { chatJson<T>(p: { modelo; sistema; usuario; schema; reasoningEffort; timeoutMs }): Promise<T>; transcrever(p: { dados: Uint8Array; mime; nomeArquivo }): Promise<string> }`.
  Toda tarefa recebe o cliente por parâmetro (default = real); testes usam um cliente falso
  que devolve respostas fixas. **Nenhum teste chama a API.**
- Chat: `POST /v1/chat/completions` com `response_format: { type: "json_schema", json_schema: { name, schema } }`, `reasoning_effort` e `max_retries` 2 (reimplementado: uma retentativa em 5xx/timeout).
  Transcrição: `POST /v1/audio/transcriptions` multipart, `language: pt`, modelo
  `OPENAI_MODELO_TRANSCRICAO` (default `whisper-1`).
- Modelos iguais aos workflows **[design]**: `gpt-5.4-mini` (qualificador, porteiro; `reasoning_effort: low`, timeout 60 s), `gpt-5.4` (redator; `medium`, 90 s).
- Prompts de sistema copiados **literalmente** dos JSON para `src/server/ia/prompts/*.ts`, com
  `VERSAO_PROMPT` nova quando mudarem: `motor-qualificador-2026-11-04` (ganhou
  `horas_estimadas`), `motor-porteiro-2026-11-04` e `motor-redator-2026-11-04` (ganharam o
  bloco de avaliações, §8). Nunca gravar raciocínio do modelo; só a `justificativa_curta`.
- Toda saída passa por validação em código antes de tocar o banco (porta dos nós "Validar").

## 3. Transcrição (porta do WF-11)

- Tarefa `transcricao`, 1 min, só com adaptador e chave. Reivindica até 5 `mensagens` com
  `transcricao_status = 'pendente'` e `evolution_msg_id`, mais recentes primeiro, `for update
  skip locked`; órfãs (`transcrevendo` há mais de 15 min) voltam; 3 tentativas depois `falhou`
  (SQL literal do nó "Reivindicar audios").
- Baixa pelo `adaptador.baixarMidia(evolutionMsgId)`; `null` → `sem_midia` (terminal).
- Transcreve e **sobrescreve `mensagens.texto`**; `transcrito_em`, erro limpo; empurra
  `qualificar_apos = now() + 2 min` do lead se não `opt_out`/`sem_atendimento` (SQL literal).
  Transcreve também áudio da equipe **[design]**.
- Falha: `transcricao_erro` (500 chars, sem URL com chave), `pendente` ou `falhou` na 3ª.

## 4. Qualificador (porta do WF-02 + `horas_estimadas`)

- Tarefa `qualificador`, 1 min. Reivindica até 8 leads com `qualificar_apos <= now()`, não
  `opt_out`/`sem_atendimento`, zerando `qualificar_apos` (SQL literal). Monta a ficha + 40
  mensagens como o nó "Montar prompt do lead".
- Schema de saída = o do WF-02 **mais** `horas_estimadas: integer` (1..8). Regra no prompt
  **[design §7.1]**: pacote de 4h → 4; "2 pessoas" → 2; pacote sem tamanho → 4; sem sinal →
  1; teto 8. Validação em código: inteiro, clamp 1..8, default 1.
- Grava como o nó "Gravar qualificacao" (eventos `lead_qualified`, `stage_changed`,
  `temperature_changed`, `followup_cancelled` na mesma instrução; `correlacao_id =
  'motor:qual:<execução>:<id>'`; `origem_tipo 'motor'`), mais `leads.horas_estimadas`.
- Follow-up sugerido: nó "Agendar followup" literal (um pendente por lead; `followup_created`).
- Falha do modelo ou validação: `qualificar_apos = now() + 10 min` (literal).
- Migração `0004_ia.sql`: `leads.horas_estimadas smallint check between 1 and 8`;
  `configuracoes (chave text pk, valor jsonb, atualizado_em)` com linhas iniciais
  `ritmo = {"modo":"conservador"}` e `preco_hora = 360` (fase 4 usa); grants ao motor;
  `painel_rw` lê/escreve `configuracoes` (tela de setup).

## 5. Ciclo de vida do follow-up (fase 3) **[construtor]**

Status de `followups` passa a aceitar: `pendente` (agendado, sem texto) → `aguardando_aprovacao`
(texto pronto) → `aprovado` (humano tocou Enviar) → `enviando` → `enviado`; ramos: `abortado`
(porteiro barrou **ou** humano recusou), `cancelado` (conversa viva/opt-out/requalificação),
`expirado` (sem decisão até 19h59 de São Paulo do dia em que ficou pronto).

- `mensagens.followup_id uuid` (eco/registro do envio) **[design §5.2]**.
- A CTE de "conversa viva" (`ingestao.ts`) e a requalificação cancelam `pendente`,
  `aguardando_aprovacao` **e** `aprovado` (ainda não saiu) — nunca `enviando`/`enviado`.
- Índice `followups_um_pendente_por_lead` passa a cobrir `status in ('pendente',
  'aguardando_aprovacao', 'aprovado', 'enviando')`.
- `followup_toques` e o fluxo wa.me continuam existindo para leitura histórica; `/minha-fila` e
  `/followups` deixam de ser o caminho do follow-up (navegação aponta para `/aprovar`), mas as
  rotas ficam no ar até a fase 4 revisar a navegação.

## 6. Porteiro e redator (porta do WF-03)

- Tarefa `redator`, 15 min, só das 8h às 19h59 (São Paulo). Seleciona até 10 `pendente` sem
  texto, vencidos, lead com dono, não `opt_out`/`sem_atendimento` (SQL literal do nó "Buscar
  followups a redigir", já com `textos_anteriores` de 5).
- **Cota (§7):** antes de chamar o porteiro, conta os follow-ups com `sugerido_em` no dia
  (São Paulo). Bateu a cota → os vencidos ficam para o dia seguinte, ordenados por valor
  esperado desc (§7.2), e a tarefa para.
- Porteiro: prompt e validação literais; `enviar=false` com `reagendar_para` → reagenda
  (`followup_rescheduled`); sem data → `abortado` (`followup_blocked`); `enviar=true` →
  `followup_approved` (nome legado mantido; significa "porteiro liberou").
- Redator: modo REABRIR/RETOMAR calculado em código (literal), links permitidos só
  `/agendar` e `/carteira`, limpeza de emoji/travessão, 10..600 chars (literal). Grava
  `texto_sugerido`, `sugerido_em`, `status = 'aguardando_aprovacao'`, evento
  `message_generated`, e enfileira push `followup` para o dono (`url '/aprovar'`,
  título `Follow-up pronto: <nome ou telefone>`), agrupado pelo WF-09 já portado. A cláusula
  "obsoletas" das notificações passa a conferir `followups.status = 'aguardando_aprovacao'`
  em vez de `v_followups_fila`.
- Erro de modelo/validação: `agendado_para = now() + 30 min` (literal).

## 7. Modos de ritmo **[design §7.3 + construtor]**

- `configuracoes.ritmo = { modo: 'conservador' | 'aquecido', ligado_em }`. Conservador: 20
  preparados/dia; aquecido: 60/dia. Tela de setup do admin (em `/admin`, seção "Ritmo") com
  aviso "modo perigoso" e confirmação para ligar o aquecido.
- Tarefa `ritmo-meia-noite`, 5 min: se `aquecido` e já passou a meia-noite de São Paulo depois
  de `ligado_em`, volta a `conservador` (evento `rhythm_reset` em `eventos_automacao`,
  `entidade_tipo 'lead'` não serve → entidade `config`: a CHECK de `entidade_tipo` ganha
  `'config'` e `entidade_id` passa a aceitar um uuid fixo `00000000-0000-0000-0000-000000000001`).
- **Valor esperado** (função pura `valorEsperado(lead)` em `src/server/motor/valor.ts`,
  reutilizada na fase 4): `horas_estimadas (default 1) × preco_hora × chance[etiqueta][temperatura]`
  com a tabela de §9.1; etapas fora da tabela e sem temperatura → chance 5%; fora do pipeline
  (opt_out, Negociação encerrada, Aula realizada, agendado no passado, sem_atendimento) → 0.
- Envio: intervalo mínimo entre disparos de follow-up 120 s (conservador) e 45 s (aquecido).
- Expiração: tarefa `expirar-followups`, 5 min: `aguardando_aprovacao` com `sugerido_em` em dia
  anterior (São Paulo) ou hoje depois das 19h59 → `expirado` (evento `followup_expired`),
  notificação pendente associada → `cancelada`.

## 8. Fila de aprovação e avaliações

- Rota `/aprovar` (atendente; admin com `?vendedor=<id>` vê a fila de qualquer um). Um card
  por tela com rolagem vertical e `scroll-snap` (Reels). Card: nome, temperatura, etapa,
  horas e valor estimado (R$), número do toque (`n_toques + 1`), últimas 6 mensagens com
  autor, texto da IA com o modo; tocar no texto abre edição (textarea). Botões grandes **Não
  enviar** e **Enviar**.
- Decidir abre folha com motivos (chips) e campo livre; recusa: Cedo demais, Tom errado, Já
  falei com ele, Repetiu assunto, Lead não quer, Outro; envio: Texto certo, Lead quente,
  Ajustei o texto, Outro. "Pular" fecha sem motivos (a avaliação é gravada mesmo assim, com
  `motivos = {}`).
- Server fns em `src/server/aprovacao.ts`: `listarFilaAprovacao({ vendedorId? })`,
  `decidirFollowup({ followupId, decisao: 'enviar' | 'recusar', texto?, motivos, textoLivre? })`.
  Posse: atendente só followup de lead dele; admin qualquer. `enviar` → `status = 'aprovado'`,
  `texto_enviado = texto editado ou sugerido`, `aprovado_em`, `aprovado_por`; `recusar` →
  `abortado` com `motivo_cancelamento 'recusado pelo vendedor'`. Eventos
  `followup_human_approved` / `followup_human_rejected`. Tudo numa transação com a avaliação.
- Tabela `followup_avaliacoes (id, followup_id, usuario_id, decisao, motivos text[],
  texto_livre, texto_original, texto_enviado, criado_em)`. Prompt do porteiro e do redator
  recebe: até 10 avaliações do próprio vendedor e até 10 recusas gerais recentes, no formato
  `"<texto sugerido>" → <enviar|recusar> → <motivos; texto livre>`, mais os pares
  original/editado. Bloco adicionado ao fim do prompt de sistema; `VERSAO_PROMPT` nova.
- Conversa viva: lead manda mensagem → `cancelado` e some da fila (já coberto por §5).

## 9. Envio dos aprovados

- Tarefa `envio-followups`, 1 min, só com adaptador. Janela 8h–19h59 São Paulo; fora dela
  nada sai (aprovado espera a próxima abertura). Respeita o intervalo mínimo do modo desde o
  último follow-up `enviado`. Pega o `aprovado` mais antigo por `aprovado_em`, `for update skip
  locked`, marca `enviando`, chama `adaptador.enviar({ tipo: 'texto', texto_enviado })`,
  grava a mensagem via `registrarMensagem` com autoria do aprovador e `followup_id`, marca
  `enviado`, `enviado_em`, `n_toques += 1`, evento `followup_sent`. Falha no envio: volta a
  `aprovado` com `erro_envio` (coluna nova) e 3 tentativas; depois `abortado` com motivo
  'falha no envio' e push ao vendedor.
- Sem assinatura no texto **[design §5.4]**.

## 10. Telas e navegação

- Atendente: novo item "Follow-ups" → `/aprovar` com contador; `/minha-fila` continua, mas o
  card de follow-up passa a abrir `/aprovar` em vez de wa.me quando houver `aguardando_aprovacao`.
- Admin: `/admin` ganha seção "Ritmo" (modo, cota do dia usada/total, intervalo) e seção "IA"
  (chave configurada? última execução de cada tarefa, pendentes de transcrição, leads a
  qualificar, follow-ups aguardando aprovação por vendedor). `/wf02` continua lendo
  `v_wf02_*` (produção) sem mudança.

## 11. Fora de escopo

Webhook de vendas, comissão, Kanban com valores, painel do vendedor, ranking (fase 4).
Recalibração das chances. Importar histórico parado.

## 12. Testes exigidos

Normalizador de horas (`horas_estimadas`), validação das três saídas de IA (com entradas
malformadas), modo REABRIR/RETOMAR, limpeza do texto, cota por modo, janela e intervalo de
envio, expiração, `valorEsperado`, ciclo de status (conversa viva cancela `aguardando_aprovacao`
e `aprovado`), posse em `decidirFollowup`, bloco de avaliações no prompt. Tarefas com cliente
de IA falso e adaptador falso nos testes de banco.
