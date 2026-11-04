# WakeCRM fases 2 e 3 · IA de volta e follow-up com aprovação · Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** transcrição, qualificador com `horas_estimadas`, porteiro e redator rodando no motor; follow-up só sai depois de um humano tocar "Enviar" numa fila estilo Reels, com modos de ritmo, cadência e avaliações que voltam ao prompt.

**Architecture:** cliente de IA por `fetch` atrás de `ClienteIa` (injetável; testes usam falso). Cada tarefa de IA é um módulo em `src/server/motor/` que exporta `tarefaX(deps)`; `iniciar.ts` registra tudo. Ciclo de vida do follow-up ganha `aguardando_aprovacao`/`aprovado`/`expirado`; `/aprovar` é a fila; `envio-followups` dispara os aprovados pelo adaptador.

**Tech Stack:** o da fase 1. Nenhuma dependência nova (OpenAI via `fetch`).

**Spec:** `docs/superpowers/specs/2026-11-04-wakecrm-fases-2-3-ia-followup.md` (autoridade), sobre `docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md` §5.6, §7, §9.5.

## Global Constraints

- Tudo da fase 1 (`docs/superpowers/plans/2026-11-04-wakecrm-fase-1.md`, "Global Constraints") continua valendo.
- **Nenhum teste chama a OpenAI.** Tarefas recebem `ClienteIa` e `AdaptadorEvolution` por parâmetro; testes passam falsos.
- Prompts de sistema **copiados literalmente** dos JSON (`docs/n8n-legado/wf-02-qualificador-ia.json`, `wf-03-redator-de-followup.json`, campo `parameters.options.systemMessage` dos nós `*IA`), extraídos por script, nunca digitados; acréscimos só ao fim, com `VERSAO_PROMPT` nova.
- Modelos: `gpt-5.4-mini` (qualificador, porteiro; `reasoning_effort: "low"`, 60 s), `gpt-5.4` (redator; `"medium"`, 90 s). Transcrição `OPENAI_MODELO_TRANSCRICAO` default `whisper-1`, `language: pt`.
- Toda saída de IA validada em código antes do banco; nunca gravar raciocínio.
- Nenhum follow-up sai sem `status = 'aprovado'` por humano; envio só das 8h às 19h59 (São Paulo).
- Cota conservador 20 / aquecido 60 preparados por dia; intervalo 120 s / 45 s.
- Datas em `America/Sao_Paulo` no SQL (`at time zone`), nunca no fuso do processo.
- Arquivos compartilhados do coordenador: `vite.config.ts` (já exclui `src/server/aprovacao.ts` e `src/server/admin-ia.ts`), `package.json`, `eslint.config.js`, `.env.example` (já tem `OPENAI_API_KEY`, `OPENAI_MODELO_TRANSCRICAO`).

## Decisões deste plano

- Schema inteiro das duas fases numa migração só: `0004_ia_followup.sql` (Task 1).
- `registrarMensagem(db, m, autoria?: { usuarioId: string; followupId?: string })` grava `mensagens.followup_id` (Task 4).
- As tarefas não se registram sozinhas: cada módulo exporta uma função; `iniciar.ts` só muda na Task 8 (evita colisão entre ondas).
- Evento de configuração usa `entidade_tipo 'config'` e `entidade_id '00000000-0000-0000-0000-000000000001'`.

## Review Focus

1. Lead manda mensagem enquanto o follow-up está `aprovado` e ainda não saiu → cancelado, nunca enviado (Task 4 `conversa viva cancela aprovado`; Task 6 `envio ignora cancelado`).
2. Cota bate no meio da rodada → nenhum texto a mais é gerado naquele dia; vencidos saem no dia seguinte por valor esperado (Task 5 `cota corta a rodada`).
3. Vendedor tenta decidir follow-up de lead de outro → recusado no servidor (Task 4 `posse`).
4. IA devolve JSON fora do schema (etiqueta inválida, `horas_estimadas` "quatro", followup sem data) → qualificação aproveita o que dá e nunca derruba a rodada (Task 3 `validação tolerante`).
5. Processo cai entre `adaptador.enviar` e `status = 'enviado'` → na volta, não reenvia (Task 6 `enviando órfão vira abortado com aviso`, nunca reenvio automático).

---

### Task 1: Migração 0004, cliente de IA, prompts e valor esperado

**Files:** Create `db/migrations/0004_ia_followup.sql`, `src/server/ia/tipos.ts`, `src/server/ia/openai.ts`, `src/server/ia/openai.test.ts`, `src/server/ia/falso.ts` (cliente falso para testes), `src/server/ia/prompts/qualificador.ts`, `src/server/ia/prompts/porteiro.ts`, `src/server/ia/prompts/redator.ts`, `src/server/ia/prompts/extrair.mjs` (script que gera os três arquivos a partir dos JSON), `src/server/motor/valor.ts`, `src/server/motor/valor.test.ts`, `src/server/motor/migracoes-0004.db.test.ts`.
**Resources:** banco de teste. **Depends-on:** none.

**Interfaces (Produces):**
- `0004_ia_followup.sql`: `leads.horas_estimadas smallint check (between 1 and 8)`; `configuracoes (chave text pk, valor jsonb not null, atualizado_em timestamptz default now())` + trigger `set_atualizado_em` + linhas `ritmo = '{"modo":"conservador"}'`, `preco_hora = '360'`; `followups`: CHECK de status passa a `('pendente','aguardando_aprovacao','aprovado','enviando','enviado','cancelado','abortado','expirado')`, colunas `aprovado_em timestamptz`, `aprovado_por uuid references usuarios`, `erro_envio text`, `tentativas_envio smallint default 0`; índice `followups_um_pendente_por_lead` recriado para `status in ('pendente','aguardando_aprovacao','aprovado','enviando')`; `mensagens.followup_id uuid references followups`; `followup_avaliacoes (id uuid pk, followup_id uuid not null references followups, usuario_id uuid not null references usuarios, decisao text check in ('enviar','recusar'), motivos text[] not null default '{}', texto_livre text, texto_original text, texto_enviado text, criado_em timestamptz default now())` + índices por `followup_id` e `(usuario_id, criado_em desc)`; `eventos_automacao` CHECK de `entidade_tipo` ganha `'config'`; grants: motor select/insert/update em `configuracoes`, `followup_avaliacoes` (insert/select), `painel_rw` select/update em `configuracoes`, `painel_ro` select em `configuracoes`; raise exception se a role do motor não existir (igual à 0002).
- `tipos.ts`: `type ClienteIa = { chatJson<T>(p: { modelo: string; sistema: string; usuario: string; schema: Record<string, unknown>; nomeSchema: string; reasoningEffort: "low" | "medium"; timeoutMs: number }): Promise<T>; transcrever(p: { dados: Uint8Array; mime: string; nomeArquivo: string }): Promise<string> }`.
- `openai.ts`: `criarClienteOpenAi(fetchFn = fetch): ClienteIa | null` (null sem `OPENAI_API_KEY`); `chatJson` faz `POST https://api.openai.com/v1/chat/completions` com `response_format json_schema`, uma retentativa em 5xx/timeout (`AbortController`), lança `ErroIa` com status; `transcrever` faz multipart em `/v1/audio/transcriptions`.
- `falso.ts`: `clienteIaFalso(respostas: { chat?: unknown[]; transcricao?: string[] })` devolve respostas em ordem e registra as chamadas.
- `prompts/*.ts`: `export const SISTEMA = \`…\`` (literal) e `export const VERSAO_PROMPT = "motor-<agente>-2026-11-04"`; `qualificador.ts` também exporta `SCHEMA` (o do WF-02 + `horas_estimadas: { type: "integer", minimum: 1, maximum: 8 }` em `required`) e, ao fim do SISTEMA, o bloco literal:
  `\n\n  HORAS ESTIMADAS\n\n  Devolva horas_estimadas como inteiro de 1 a 8: pacote de 4h vira 4; "2 pessoas" vira 2;\n  pacote sem tamanho vira 4; sem nenhum sinal vira 1; nunca acima de 8.`
  `porteiro.ts` exporta `SCHEMA` (WF-03 "Formato da decisao"); `redator.ts` exporta `SCHEMA` (`{ texto }`); os dois ganham ao fim do SISTEMA o marcador `\n\n{{AVALIACOES}}` que a Task 5 substitui.
- `valor.ts`: `CHANCES` (tabela §9.1), `valorEsperado(l: { etiqueta: string; temperatura: string | null; horasEstimadas: number | null; optOut: boolean; semAtendimento: boolean; dataAgendada: string | null }, precoHora: number, agora = new Date()): number` e `valorCheio(horas, precoHora)`.

- [ ] Testes puros: `valor.test.ts` — Link enviado/quente 4h a R$ 360 → 576; Novo Lead sem temperatura → 5%; Agendado no passado → 0; opt_out → 0; `openai.test.ts` com `fetchFn` falso: monta o corpo certo (`model`, `reasoning_effort`, `response_format.json_schema.name`), faz parse do `choices[0].message.content`, retenta uma vez em 503 e lança `ErroIa` em 400; `transcrever` manda multipart com `language=pt`.
- [ ] `extrair.mjs`: lê os JSON, acha os nós `Qualificador IA`, `Porteiro IA`, `Redator IA`, escreve os `.ts` com o `systemMessage` escapado em template literal; rode-o e **confira por diff** que o texto é idêntico ao JSON (teste: `prompts.test.ts` compara `SISTEMA` com o JSON lido em runtime, exceto o sufixo adicionado).
- [ ] Teste de banco `migracoes-0004.db.test.ts`: `configuracoes` tem `ritmo` e `preco_hora`; `followups` aceita `aguardando_aprovacao` e rejeita `xyz` (23514); motor insere em `followup_avaliacoes`.
- [ ] `bun run check`, `bun run test:db` → PASS.

### Task 2: Transcrição (porta do WF-11)

**Files:** Create `src/server/motor/transcricao.ts`, `src/server/motor/transcricao.db.test.ts`.
**Resources:** banco de teste. **Depends-on:** 1.

**Interfaces:** Consumes `ClienteIa`, `AdaptadorEvolution`. Produces `tarefaTranscricao(deps: { ia: ClienteIa; adaptador: AdaptadorEvolution }): Promise<number>` (processadas) e `reivindicarAudios(db, limite = 5)` (SQL literal do nó "Reivindicar audios").
- [ ] Testes de banco com falsos: `transcreve e sobrescreve texto e empurra qualificar_apos` (lead não opt_out → `qualificar_apos ≈ now()+2min`), `sem midia vira sem_midia`, `falha conta tentativa e na terceira vira falhou`, `orfao volta`, `audio da equipe tambem transcreve`.
- [ ] `bun run test:db` → PASS.

### Task 3: Qualificador (porta do WF-02 + horas)

**Files:** Create `src/server/motor/qualificador.ts`, `src/server/motor/qualificador.test.ts`, `src/server/motor/qualificador.db.test.ts`.
**Resources:** banco de teste. **Depends-on:** 1.

**Interfaces:** Produces `montarPromptLead(l: LinhaLead): string` (literal do nó "Montar prompt do lead"), `validarQualificacao(cru: unknown, ctx: { etiquetaAtual; minimoLocal; limiteLocal }): Qualificacao | { erro: string }` (literal + `horasEstimadas`), `tarefaQualificador(deps: { ia: ClienteIa }): Promise<number>`; grava com o SQL literal de "Gravar qualificacao"/"Agendar followup" (`correlacao_id 'motor:qual:' || <uuid da rodada> || ':' || id`, `origem_tipo 'motor'`, `modelo`, `versao_prompt`), mais `horas_estimadas`.
- [ ] Puros: `validação tolerante` (etiqueta inválida → atual; `Negociacao encerrada` → com ç; temperatura inválida → ''; sem resumo → erro; followup com data fora do CARIMBO → sem followup; `quando` abaixo do mínimo → mínimo; `horas_estimadas` "quatro"/0/9/ausente → 1/1/8/1), `prompt do lead` com histórico vazio → "(nenhuma mensagem registrada)".
- [ ] Banco: `qualifica e grava eventos` (lead_qualified + stage_changed + temperature_changed quando mudam; `horas_estimadas` gravada; followup criado com `followup_created`), `falha reagenda +10 min`, `nao requalifica opt_out`, `segundo followup nao duplica pendente`.
- [ ] `bun run check`, `bun run test:db` → PASS.

### Task 4: Ciclo de vida e server da aprovação

**Files:** Create `src/server/aprovacao.ts`, `src/server/aprovacao.db.test.ts`; Modify `src/server/motor/ingestao.ts` (CTE `cancelados` e `registrarMensagem` com `followupId`), `src/server/motor/ingestao.db.test.ts`, `src/server/motor/notificacoes.ts` (cláusula obsoletas), `src/server/motor/notificacoes.db.test.ts`.
**Resources:** banco de teste. **Depends-on:** 1.

**Interfaces:** Produces `listarFilaAprovacao({ vendedorId?: string })` (server fn; atendente ignora `vendedorId`; admin usa) devolvendo `CardAprovacao[] = { followupId, leadId, nome, telefone, temperatura, etiqueta, horasEstimadas, valorEsperado, numeroToque, modo, textoSugerido, sugeridoEm, mensagens: { autoria, texto, enviadaEm, direcao }[] (últimas 6) }`; `decidirFollowup({ followupId, decisao: 'enviar' | 'recusar', texto?, motivos: string[], textoLivre? })` com Zod (motivos ⊆ listas da spec §8); lógica SQL em `decidir(db, sessao, entrada)` testável; `registrarMensagem(db, m, autoria?: { usuarioId; followupId? })`.
- [ ] Banco: `posse` (atendente de outro → erro; admin ok), `enviar grava aprovado, texto_enviado, aprovado_por, avaliacao e evento followup_human_approved`, `recusar grava abortado e followup_human_rejected`, `pular grava avaliacao com motivos vazios`, `conversa viva cancela aguardando_aprovacao e aprovado` (e notificação pendente vira cancelada), `nao cancela enviando`, `obsoletas usa status do followup`.
- [ ] `bun run check`, `bun run test:db` → PASS.

### Task 5: Porteiro, redator, cota, ritmo e expiração

**Files:** Create `src/server/motor/redator.ts`, `src/server/motor/redator.test.ts`, `src/server/motor/redator.db.test.ts`, `src/server/motor/ritmo.ts`, `src/server/motor/ritmo.test.ts`, `src/server/motor/ritmo.db.test.ts`.
**Resources:** banco de teste. **Depends-on:** 1, 4.

**Interfaces:** Produces em `ritmo.ts`: `MODOS = { conservador: { cotaDia: 20, intervaloSegundos: 120 }, aquecido: { cotaDia: 60, intervaloSegundos: 45 } }`, `lerRitmo(db)`, `definirRitmo(db, modo, usuarioId)` (evento `rhythm_changed`), `preparadosHoje(db)`, `dentroDaJanela(agora: Date): boolean` (8h–19h59 SP), `tarefaRitmoMeiaNoite(db)`, `tarefaExpirarFollowups(db)`. Em `redator.ts`: `montarPromptPorteiro`, `montarPromptRedator` (literais, com `{{AVALIACOES}}` preenchido por `blocoAvaliacoes(db, vendedorId)`: até 10 do vendedor + 10 recusas gerais, formato `"<texto>" → <decisão> → <motivos; livre>` e pares original/editado), `validarPorteiro`, `validarTexto` (literais), `modoDoFollowup` (literal), `tarefaRedator(deps: { ia: ClienteIa })`.
- [ ] Puros: `modo REABRIR/RETOMAR` (etiquetas concretas, tipos concretos, aula marcada, Link enviado fica REABRIR), `limpeza do texto` (link proibido removido, permitido mantido, emoji/travessão, 600, <10 lança), `validarPorteiro` (enviar default true; reagendar clamp), `dentroDaJanela` (07:59 false, 08:00 true, 19:59 true, 20:00 false em SP), `blocoAvaliacoes` formata.
- [ ] Banco: `porteiro barra sem data aborta`, `porteiro reagenda`, `redator grava aguardando_aprovacao, evento e push`, `cota corta a rodada` (modo conservador com 20 já preparados hoje → 0 processados; vencidos ordenados por valor esperado desc na próxima), `fora da janela nao roda`, `falha reagenda +30 min`, `expira as 19h59` (sugerido ontem → expirado + notificação cancelada), `aquecido volta a conservador apos meia-noite`.
- [ ] `bun run check`, `bun run test:db` → PASS.

### Task 6: Envio dos aprovados

**Files:** Create `src/server/motor/envio-followups.ts`, `src/server/motor/envio-followups.db.test.ts`.
**Resources:** banco de teste. **Depends-on:** 4, 5.

**Interfaces:** Produces `tarefaEnvioFollowups(deps: { adaptador: AdaptadorEvolution; agora?: () => Date }): Promise<number>`; usa `dentroDaJanela`, `lerRitmo`, intervalo desde o último `enviado_em`; `enviando` órfão (> 15 min) → `abortado` com motivo 'envio sem confirmação' + push ao vendedor (nunca reenvio automático).
- [ ] Banco (adaptador falso que registra chamadas): `envia o aprovado mais antigo` (mensagem com `followup_id`, `usuario_id = aprovado_por`, `enviada_por 'app'`, status `enviado`, `n_toques + 1`, evento `followup_sent`), `respeita intervalo`, `fora da janela nao envia`, `falha volta a aprovado com erro e na terceira aborta`, `envio ignora cancelado`, `enviando órfão vira abortado com aviso`.
- [ ] `bun run check`, `bun run test:db` → PASS.

### Task 7: Fila de aprovação (UI) — MOVIDA

Movida para `docs/superpowers/plans/2026-11-05-wakecrm-interface.md`, Task 3 (as telas seguem `docs/ref/ui/`). Aqui não há mais trabalho.

### Task 8: Admin (Ritmo e IA) e ligação das tarefas

**Files:** Create `src/server/admin-ia.ts`, `src/server/admin-ia.db.test.ts`; Modify `src/server/motor/iniciar.ts`. (A UI — `Ritmo.tsx`, `PainelIa.tsx` — fica com o plano da interface, Task 5.)
**Resources:** banco de teste. **Depends-on:** 2, 3, 5, 6.

**Interfaces:** `getPainelIa()` (chave configurada, adaptador presente, pendentes de transcrição, leads a qualificar, aguardando aprovação por vendedor, aprovados a enviar, última execução por tarefa lida de `configuracoes.tarefas_execucao` que cada tarefa atualiza via `registrarExecucao(db, nome)` — adicione em `agenda.ts`? não: em `admin-ia.ts` exporte `registrarExecucao` e chame de `iniciar.ts` após cada tarefa), `getRitmo()`, `definirRitmoAdmin({ modo })` (aquecido exige `confirmar: true`). `iniciar.ts`: `transcricao` 1 min e `envio-followups` 1 min só com adaptador; `qualificador` 1 min e `redator` 15 min só com `criarClienteOpenAi()`; `ritmo-meia-noite` e `expirar-followups` 5 min sempre.
- [ ] Banco: `definir aquecido sem confirmar falha`, `definir aquecido grava evento rhythm_changed`.
- [ ] `bun run check`, `bun run build` → exit 0; fumaça: servidor buildado com `MOTOR_ATIVO=1` e sem `OPENAI_API_KEY` loga `ia.sem_chave` uma vez e não derruba.

### Task 9: Documentação e fechamento

**Files:** Modify `docs/architecture.md`, `docs/onboarding.md`, `docs/quality.md`, `PRODUCT.md`, `docs/runbook-virada.md` (envs novas), este plano (handoff), `graphify-out/`.
**Depends-on:** todas.
- [ ] Docs: tarefas e intervalos reais, tabelas/colunas da 0004, ciclo de status, envs `OPENAI_API_KEY`/`OPENAI_MODELO_TRANSCRICAO`, rota `/aprovar`, estado das fases 2–3 em PRODUCT (prontas localmente; dependem da Task 13 da fase 1 para transcrição e envio reais e de `OPENAI_API_KEY` para qualificar/redigir).
- [ ] `bun run check`, `bun run test:db`, `bun run build`, `git diff --check` → exit 0.
