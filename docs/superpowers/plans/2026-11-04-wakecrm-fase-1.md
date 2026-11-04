# WakeCRM fase 1 · Atendimento volta · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o próprio app passa a ser o motor do atendimento: recebe webhooks numa fila no
Postgres, grava mensagens, distribui leads por peso, mantém a saúde do número, envia
mensagens e push, sem n8n.

**Architecture:** um processo Nitro. Endpoints `/api/webhooks/*` só gravam o corpo bruto em
`webhook_eventos`. Quando `MOTOR_ATIVO=1`, `src/server.ts` liga o motor
(`src/server/motor/`): um trabalhador da fila (`FOR UPDATE SKIP LOCKED`, sequência estrita
por `chave_ordem`, até 4 chaves em paralelo) e tarefas agendadas com advisory lock. O
formato do Evolution Go fica isolado em `src/server/evolution/`; o resto do motor só
conhece `EventoNormalizado`. Migrações SQL versionadas em `db/migrations/`, aplicadas por
`scripts/migrar.mjs`, com uma role nova `wakecrm_motor`.

**Tech Stack:** TanStack Start + Nitro, React 19, `pg` sem ORM, Zod 3, `bun:test`,
Postgres 14 (teste local em Docker `postgres:14-alpine`).

**Spec:** `docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md` (§4, §5, §6,
§9.4, §9.5, §10 item 1).

## Global Constraints

- Português do Brasil em tela, comentário, coluna e doc; fuso `America/Sao_Paulo`.
- Stack fixa: TanStack Start, React 19, Nitro, Bun, `pg` sem ORM, Tailwind v4, shadcn/ui. Nenhuma dependência nova.
- Postgres 14: nada de recurso de 15+ (`MERGE`, `NULLS NOT DISTINCT`, `security_invoker`).
- Só `src/server/db.ts` importa `pg` ou lê `DATABASE_URL*` (lint).
- Zod em toda fronteira; casts SQL explícitos (`$1::uuid`); `snake_case` → `camelCase` no servidor; datas ISO.
- Segredo de webhook comparado por SHA-256 + `timingSafeEqual`; inválido ou ausente → 404.
- `usuarios.senha_hash` nunca sai do servidor e não entra em grant da `wakecrm_motor`.
- Toda decisão do motor vira linha em `eventos_automacao` no mesmo comando SQL que muda o dado.
- Vendedor só vê e responde lead atribuído a ele; lead sem dono só o admin. Validação no servidor.
- Sem assinatura no WhatsApp: o nome do autor aparece só no app.
- Envio livre de atendimento não tem cota nem horário.
- n8n nunca roda em paralelo; o motor só liga com `MOTOR_ATIVO=1`.
- Endpoint de webhook não processa nada na requisição: grava bruto e responde 200.
- Fila: até 5 tentativas com espera crescente, depois `falhou`; `processando` há mais de 15 min volta para `pendente`.
- Logs sem texto de conversa, telefone, token ou segredo.
- Aplicar migração em produção, apontar webhook e ligar `MOTOR_ATIVO` exigem autorização específica do dono.
- Commit só quando o usuário pedir (AGENTS.md). Os passos "Commit" deste plano ficam como ponto de checagem.

## Decisões deste plano (construtor)

- **Role:** `wakecrm_motor` (`DATABASE_URL_MOTOR`, pool `getPoolMotor()`), DML nas tabelas do motor e SELECT por coluna em `usuarios` sem `senha_hash`. `painel_ro`/`painel_rw` continuam para as telas antigas.
- **Migrações:** arquivos `db/migrations/NNNN_nome.sql`, cada um numa transação, registrados em `wakeclub.migracoes`. `0001_base.sql` é o DDL do workflow "db setup" **sem views e sem backfill** (as views do painel vivem só em produção: `../db/painel-views.sql` não existe neste checkout). Em produção o 0001 é no-op.
- **Autoria:** `mensagens.usuario_id` + `mensagens.enviada_por in ('app','celular')`; `null` = legado ("Equipe").
- **Distribuição:** conta para o peso só atribuição com motivo `rodizio` ou `desativacao` nos últimos 30 dias (lido de `eventos_automacao`). Peso 0 não recebe lead novo, nem por menção. Só mensagem do lead dispara a atribuição na entrada; conversa só da equipe com lead sem dono fica com o admin.
- **Ordem sem chave:** enquanto o adaptador não souber extrair a conversa, `chave_ordem = 'evolution'` (tudo em sequência). Vendas: `null` (independentes).
- **Push de mensagem nova:** sempre enfileira; o service worker não mostra quando há janela visível do app (payload `seAppFechado: true`).
- **Respostas rápidas:** só texto nesta fase, tabela `respostas_rapidas`, cadastro em `/templates` (substitui a demonstração e `mock-data.ts`).
- **Corte na virada:** migração `0003_virada.sql`, aplicada só no momento do corte (`bun run db:migrate -- --ate 0002` antes).

## Review Focus

1. Evolution reentrega o mesmo evento → mensagem não duplica, movimento não roda duas vezes (Task 6, `idempotente por evolution_msg_id`).
2. Eco do envio chega antes de o app gravar o próprio envio → a linha termina `enviada_por='app'` com `usuario_id`, uma só (Task 12, `eco antes do insert`).
3. Mensagem nova de lead cujo dono foi desativado → vai para a distribuição, não para o inativo (Task 7, `dono inativo conta como sem dono`).
4. Lead cita nome ambíguo, de vendedor pausado ou inativo → distribuição normal (Task 7, `mencao ambigua ou pausada`).
5. Dois trabalhadores (réplicas) disputando a mesma conversa → nunca dois eventos da mesma chave em `processando` (Task 4, `dois reivindicadores`).

---

### Task 1: Legado n8n e regras de dados

**Files:** Create `docs/n8n-legado/*.json`, `docs/n8n-legado/README.md`; Modify `AGENTS.md`, `docs/architecture.md` (seções "Responsabilidade dos dados" e "Semântica").
**Resources:** none. **Depends-on:** none.

- [ ] Copiar os 11 `~/Downloads/wakeclubcrm · *.json` para `docs/n8n-legado/` com nomes ASCII (`wf-01-ingestor-evolution.json` …). Conferir antes que não há segredo (credenciais são só referência id/nome).
- [ ] README com uma linha por arquivo: workflow, o que o WakeCRM porta e em que fase.
- [ ] Reescrever "Responsabilidade dos dados" e "Semântica" de `docs/architecture.md` para o motor próprio (app chama Evolution, escreve no CRM pela `wakecrm_motor`; "abrir no WhatsApp" continua valendo até a fase 3). Ajustar o parágrafo de `AGENTS.md` que manda seguir as regras antigas.
- [ ] Verificar: `git diff --check`.

### Task 2: Migrações, role do motor e banco de teste

**Files:** Create `scripts/migrar.mjs`, `scripts/banco-teste.sh`, `db/migrations/0001_base.sql`, `db/migrations/0002_motor.sql`, `src/server/motor/banco-teste.ts`, `src/server/motor/migracoes.db.test.ts`; Modify `src/server/db.ts`, `package.json`, `eslint.config.js`, `.env.example`.
**Resources:** contêiner Docker `wakecrm-teste` na porta 54339. **Depends-on:** none.

**Interfaces:**
- Produces: `getPoolMotor(): Pool` e `type ClienteDb = Pool | PoolClient` em `db.ts`; `comTransacao<T>(fn: (c: PoolClient) => Promise<T>): Promise<T>` em `db.ts`; helper de teste `bancoTesteAtivo: boolean` e `limparBanco(): Promise<void>` em `src/server/motor/banco-teste.ts` (env `TESTE_BANCO=1`).
- Schema `0002_motor.sql`:
  - `webhook_eventos(id bigserial pk, origem text check in ('evolution','vendas'), recebido_em timestamptz default now(), corpo jsonb not null, status text default 'pendente' check in ('pendente','processando','processado','falhou','ignorado'), tentativas smallint default 0, proxima_tentativa_em timestamptz default now(), processando_desde timestamptz, erro text, chave_ordem text)`, índice parcial `(id) where status in ('pendente','processando')`.
  - `usuarios.peso smallint not null default 1 check (peso between 0 and 10)`, `usuarios.comissao_pct numeric(5,2) not null default 0 check (comissao_pct between 0 and 100)`.
  - `leads.atribuido_por text check in ('rodizio','mencao','desativacao','admin')`.
  - `mensagens.usuario_id uuid references usuarios`, `mensagens.enviada_por text check in ('app','celular')`.
  - `respostas_rapidas(id uuid pk, atalho text unique check (atalho ~ '^[a-z0-9-]{2,30}$'), texto text check length 1..2000, ativo boolean default true, criado_em, atualizado_em)` + trigger `set_atualizado_em`.
  - Grants guardados por existência da role: `wakecrm_motor` com select/insert/update em `leads, mensagens, followups, crm_outbox, eventos_automacao, instancia_eventos, instancia_estado, notificacoes, webhook_eventos`, + delete em `respostas_rapidas`, select em `push_subscriptions`, `select (id, nome, usuario, papel, ativo, peso, comissao_pct)` e `update (peso, comissao_pct, ativo)` em `usuarios`, `usage` nas sequências; `painel_rw` ganha `insert/update (peso, comissao_pct)` em `usuarios`.

- [ ] Teste `migracoes.db.test.ts`: `aplica duas vezes sem erro` (rodar `migrar.mjs` duas vezes, `wakeclub.migracoes` com 2 linhas), `motor nao le senha_hash` (`select senha_hash from wakeclub.usuarios` como `wakecrm_motor` rejeita com código `42501`).
- [ ] `scripts/banco-teste.sh`: sobe `postgres:14-alpine` como `wakecrm-teste`, cria `wakeclub`, extensão `pgcrypto`, roles `wakecrm_motor`/`painel_ro`/`painel_rw` com senha `teste`, roda `migrar.mjs`.
- [ ] `migrar.mjs`: lê `ADMIN_DATABASE_URL` (ambiente ganha do `.env`), cria `wakeclub.migracoes(nome text pk, aplicada_em timestamptz)`, cria/altera a role `wakecrm_motor` se `WAKECRM_MOTOR_PASSWORD` existir (mesmo `format(%L)` do `painel-db.mjs`), aplica pendentes em ordem, cada um em transação, aceita `--ate NNNN`, imprime nomes sem URL.
- [ ] `db.ts`: `getPoolMotor()` (`max: 8`), `comTransacao`; lint passa a cobrir `DATABASE_URL_MOTOR`.
- [ ] `package.json`: `db:migrate` e `test:db` (`TESTE_BANCO=1 DATABASE_URL_MOTOR=postgres://wakecrm_motor:teste@localhost:54339/wakeclub bun test`).
- [ ] Rodar `bash scripts/banco-teste.sh && bun run test:db` → PASS; `bun run check` → exit 0 (testes de banco pulados).

### Task 3: Endpoints de webhook (gravar bruto)

**Files:** Create `src/server/webhooks/receber.ts`, `src/server/webhooks/receber.test.ts`, `src/server/webhooks/receber.db.test.ts`, `src/routes/api/webhooks/evolution.ts`, `src/routes/api/webhooks/vendas.ts`; Modify `.env.example`.
**Resources:** banco de teste. **Depends-on:** 2.

**Interfaces:**
- Produces: `segredoConfere(recebido: string | null, esperado: string | undefined): boolean`; `receberWebhook(origem: 'evolution' | 'vendas', request: Request): Promise<Response>`; `enfileirar(db: ClienteDb, origem, corpo: unknown, chaveOrdem: string | null): Promise<number>`.
- Env: `WEBHOOK_EVOLUTION_SECRET`, `WEBHOOK_VENDAS_SECRET`. Segredo pelo header `x-webhook-secret` ou `?token=`.

- [ ] Testes puros: `segredo ausente no env nega`, `segredo errado nega`, `segredo certo aceita`; `receberWebhook` com corpo > 5 MB → 413, corpo não JSON → 400, segredo inválido → 404 (sem tocar no banco).
- [ ] Teste de banco: `grava bruto e responde 200` (linha `pendente`, corpo igual, `chave_ordem` do adaptador).
- [ ] Implementar; `chaveOrdem` vem de `chaveDeOrdem(corpo)` do adaptador (Task 5) para evolution e `null` para vendas.
- [ ] `bun run test` e `bun run test:db` → PASS.

### Task 4: Fila de entrada e agenda do motor

**Files:** Create `src/server/motor/fila.ts`, `src/server/motor/fila.test.ts`, `src/server/motor/fila.db.test.ts`, `src/server/motor/agenda.ts`, `src/server/motor/iniciar.ts`; Modify `src/server.ts`.
**Resources:** banco de teste. **Depends-on:** 2.

**Interfaces:**
- Produces:
  - `esperaAposFalha(tentativas: number): number` (segundos: 30, 120, 600, 1800; 5ª falha → `null` = `falhou`).
  - `reivindicar(db, limite: number): Promise<EventoFila[]>` com `EventoFila = { id: number; origem: string; corpo: unknown; tentativas: number }` — no máximo um por chave, só a cabeça de cada chave (`coalesce(chave_ordem, id::text)`), cabeça `processando` ou `pendente` futura bloqueia a chave.
  - `concluir(db, id, status: 'processado' | 'ignorado', erro?: string)`, `registrarFalha(db, id, erro: string)`, `devolverOrfaos(db): Promise<number>` (15 min), `reprocessar(db, id)`.
  - `type Processador = (db: PoolClient, evento: EventoFila) => Promise<'processado' | 'ignorado'>`; `rodarFila(processadores: Partial<Record<string, Processador>>, paralelo = 4)`: origem sem processador nunca é reivindicada.
  - `agendar(nome: string, intervaloMs: number, tarefa: () => Promise<void>)` com `pg_try_advisory_lock(hashtext('wakecrm:' || nome))` num cliente dedicado; erro logado sem derrubar o processo.
  - `iniciarMotor()` idempotente via `globalThis.__wakecrmMotor`; `src/server.ts` chama só quando `process.env.MOTOR_ATIVO === '1'`.
- [ ] Teste puro: sequência de `esperaAposFalha(1..5)`.
- [ ] Testes de banco: `ordem por chave` (3 eventos da chave A e 1 da B → primeira rodada pega A1 e B1), `cabeca processando bloqueia`, `dois reivindicadores` (duas transações concorrentes não pegam o mesmo id nem a mesma chave), `cinco falhas viram falhou`, `orfao volta`, `origem sem processador fica pendente`.
- [ ] Implementar; processamento de cada evento numa transação própria (`comTransacao`), falha → `registrarFalha` fora dela.
- [ ] `bun run test`, `bun run test:db` → PASS.

### Task 5: Contrato do adaptador Evolution

**Files:** Create `src/server/evolution/tipos.ts`, `src/server/evolution/index.ts`.
**Resources:** none. **Depends-on:** none.

**Interfaces:**
- Produces:
  - `type TipoMidia = 'texto' | 'imagem' | 'video' | 'documento' | 'audio' | 'figurinha' | 'contato' | 'localizacao'`.
  - `type EventoNormalizado = { tipo: 'mensagem'; telefone: string; nome: string | null; daEquipe: boolean; texto: string; tipoMidia: TipoMidia; enviadaEm: string; evolutionMsgId: string } | { tipo: 'ack'; evolutionMsgId: string; nivel: 0|1|2|3|4|5 } | { tipo: 'conexao'; instancia: string; evento: string; estado: 'open'|'connecting'|'close'|null; statusReason: number | null; qrPendente: boolean; detalhe: Record<string, unknown> } | { tipo: 'ignorar'; motivo: string }`. `telefone` já em E.164 (o adaptador resolve `@lid`).
  - `type Envio = { telefone: string } & ({ tipo: 'texto'; texto: string } | { tipo: 'imagem'|'video'|'documento'|'audio'; base64: string; mime: string; nomeArquivo?: string; legenda?: string } | { tipo: 'localizacao'; latitude: number; longitude: number; nome?: string })`.
  - `interface AdaptadorEvolution { chaveDeOrdem(corpo: unknown): string | null; normalizar(corpo: unknown): EventoNormalizado[]; enviar(envio: Envio): Promise<{ evolutionMsgId: string }>; baixarMidia(evolutionMsgId: string): Promise<{ mime: string; dados: Uint8Array } | null>; estadoConexao(): Promise<'open'|'connecting'|'close'> }`.
  - `obterAdaptador(): AdaptadorEvolution | null` (retorna `null` até a Task 13) e `chaveDeOrdemEvolution(corpo): string | null` (`'evolution'` enquanto `null`).
- [ ] `bun run typecheck` → exit 0.

### Task 6: Entrada de mensagens (porta do WF-01)

**Files:** Create `src/server/motor/telefone.ts`, `src/server/motor/telefone.test.ts`, `src/server/motor/ingestao.ts`, `src/server/motor/ingestao.db.test.ts`.
**Resources:** banco de teste. **Depends-on:** 2, 4, 5.

**Interfaces:**
- Produces: `paraE164(entrada: string): string | null` e `ehOptOut(texto: string): boolean` (regex e regra de 60 caracteres do WF-01, literais); `registrarMensagem(db: PoolClient, m: Extract<EventoNormalizado, {tipo:'mensagem'}>, autoria?: { usuarioId: string }): Promise<{ leadId: string; mensagemId: string | null; nova: boolean }>`; `processarEvolution: Processador`.
- [ ] Testes puros: `paraE164('556399998888') === '+5563999998888'`, fixo `'556332221111'` fica, `'0...'` → null, curto → null; `ehOptOut('parar')`, `ehOptOut('Não quero mais')`, `!ehOptOut('quero parar de errar na prancha, me ajuda a escolher o pacote certo')`.
- [ ] Testes de banco: `lead novo e mensagem`, `idempotente por evolution_msg_id` (segunda vez `nova=false`, `n_toques`/`qualificar_apos` não mudam de novo), `opt-out encerra` (`opt_out`, etiqueta `Negociação encerrada`, `qualificar_apos` null, followup pendente `cancelado` + evento `followup_cancelled`), `conversa viva cancela followup`, `mensagem do lead zera n_toques e agenda +2 min`, `audio entra pendente`, `fromMe fora do app vira celular`.
- [ ] Implementar `registrarMensagem` como porta do SQL "Upsert lead" + "Gravar mensagem" + "Registrar movimento" (sem o ramo `followup_toques`/eco, que sai com a fase 3), com `correlacao_id = 'motor:' || evolution_msg_id || ':' || entidade`; `processarEvolution` normaliza, aplica cada evento (mensagem → `registrarMensagem` + distribuição + push; ack/conexão → Task 8), devolve `ignorado` se todos forem `ignorar`.
- [ ] `bun run test`, `bun run test:db` → PASS.

### Task 7: Distribuição por peso e menção

**Files:** Create `src/server/motor/distribuicao.ts`, `src/server/motor/distribuicao.test.ts`, `src/server/motor/distribuicao.db.test.ts`; Modify `src/server/motor/ingestao.ts`, `src/server/motor/iniciar.ts`.
**Resources:** banco de teste. **Depends-on:** 6.

**Interfaces:**
- Produces:
  - `type Vendedor = { id: string; nome: string; peso: number; recebidos30d: number; cargaAtiva: number }`.
  - `vendedorMencionado(texto: string, vendedores: Vendedor[]): string | null` (primeiro nome, sem acento, sem caixa, palavra inteira, só peso > 0, nome repetido → null).
  - `escolherPorPeso(vendedores: Vendedor[], sortear = Math.random): string | null` (menor `recebidos30d / peso`, depois menor `cargaAtiva`, depois sorteio).
  - `atribuirSeSemDono(db: PoolClient, leadId: string, texto: string): Promise<string | null>` (lock `pg_advisory_xact_lock(hashtext('wakecrm:distribuicao'))`; dono inativo conta como sem dono; grava `atendente_id`, `atribuido_em`, `atribuido_por`, evento `assignment_changed` com `metadados.motivo`).
  - `soltarDeInativos(db): Promise<number>` e `redistribuirSoltos(db): Promise<number>` (só movimento nos últimos 90 dias, motivo `desativacao`); tarefa `distribuicao` a cada 5 min.
  - `corrigirDono(db, leadId, usuarioId, adminId)` (motivo `admin`).
- [ ] Testes puros: `peso 2 recebe o dobro` (simular 30 escolhas com contadores → 20/10), `peso 0 nao recebe`, `empate vai para menor carga`, `mencao sem acento e palavra inteira` ("quero com a tamara" → Tâmara; "tamaraíba" → null), `mencao ambigua ou pausada` → null.
- [ ] Testes de banco: `atribui na entrada e registra evento`, `lead com dono nao muda com mencao`, `dono inativo conta como sem dono`, `mencao nao conta no peso`, `desativado solta e redistribui`.
- [ ] Ligar `atribuirSeSemDono` em `processarEvolution` só para mensagem do lead em lead sem `opt_out`/`sem_atendimento`.
- [ ] `bun run test`, `bun run test:db` → PASS.

### Task 8: Saúde do número (porta do WF-07)

**Files:** Create `src/server/motor/saude.ts`, `src/server/motor/saude.db.test.ts`; Modify `src/server/motor/ingestao.ts`, `src/server/motor/iniciar.ts`.
**Resources:** banco de teste. **Depends-on:** 6.

**Interfaces:**
- Produces: `aplicarAck(db, msgId: string, nivel: number)`, `aplicarConexao(db, e: Extract<EventoNormalizado,{tipo:'conexao'}>)`, `gravarHeartbeat(db, instancia: string, resultado: { estado: string } | { erro: string })`; tarefa `heartbeat` a cada 5 min só com adaptador; instância em `EVOLUTION_INSTANCIA`.
- [ ] Testes de banco: `ack fora de ordem fica no maior`, `open apos close marca conectado_desde e zera qr`, `qr incrementa contador`, `heartbeat com erro grava heartbeat_ok false`.
- [ ] Implementar portando literalmente o SQL de "Gravar estado da instancia", "Gravar ack de entrega", "Gravar heartbeat ok/com falha".
- [ ] `bun run test:db` → PASS.

### Task 9: Push pelo motor (porta do WF-09) e aviso de mensagem nova

**Files:** Create `src/server/motor/notificacoes.ts`, `src/server/motor/notificacoes.test.ts`, `src/server/motor/notificacoes.db.test.ts`; Modify `src/server/motor/ingestao.ts`, `src/server/motor/iniciar.ts`, `src/server/push-dispatch.ts`, `public/sw.js`.
**Resources:** banco de teste. **Depends-on:** 6, 7.

**Interfaces:**
- Produces: `enfileirarMensagemNova(db, leadId: string)` (tipo `mensagem`, título `Nova mensagem: <nome ou telefone formatado>`, url `/meus-leads` para dono, `/` para admin quando sem dono); `agruparNotificacoes(pendentes: NotificacaoPendente[]): GrupoPush[]` (regra do nó "Agrupar por destinatario"); tarefa `push` a cada 1 min (órfãs 15 min, reivindica 50, entrega por `entregarPush`, marca `enviada`/`falhou`). `PayloadPush` ganha `seAppFechado?: boolean`.
- [ ] Testes puros: `agrupa por pessoa e tipo` (3 de um, 1 de outro → 2 grupos, título `3 avisos novos`, corpo com até 3 nomes e "e mais N").
- [ ] Teste de banco: `mensagem nova do lead enfileira para o dono`, `mensagem da equipe nao enfileira`.
- [ ] `sw.js`: com `dados.seAppFechado`, procurar `clients.matchAll({type:'window'})` com `visibilityState === 'visible'`; havendo, não mostrar.
- [ ] `bun run test`, `bun run test:db` → PASS.

### Task 10: Super admin da fase 1

**Files:** Create `src/server/admin-motor.ts`, `src/features/admin/MonitorDaFila.tsx`, `src/features/admin/PesoEComissao.tsx`, `src/features/admin/DonoDoLead.tsx`; Modify `src/server/admin.ts`, `src/routes/admin.tsx`, `src/routes/index.tsx` (`DetalhesDoLead`), `vite.config.ts`.
**Resources:** banco de teste. **Depends-on:** 4, 7.

**Interfaces:**
- Produces (todas `exigirAdmin()`): `getMonitorFila(): { pendentes, atrasados, falhas: { id, origem, erro, recebidoEm, tentativas }[] }`, `reprocessarEvento({ id: number })`, `alterarPesoComissao({ usuarioId, peso: 0..10, comissaoPct: 0..100 })`, `corrigirDonoDoLead({ leadId, usuarioId })`, `getDonoDoLead({ leadId }): { atendenteId, atribuidoPor, vendedores: {id,nome}[] }`.
- `alterarAtendente` com `ativo=false` passa a soltar e redistribuir os leads na mesma requisição (`soltarDeInativos` + `redistribuirSoltos`). `criarAtendente` deixa `labelId` opcional e aceita `peso`/`comissaoPct`.
- [ ] Teste de banco: `reprocessar volta falhou para pendente com tentativas zeradas`.
- [ ] UI: monitor com contagens e botão "Reprocessar" por falha; peso e % editáveis por atendente; em `DetalhesDoLead`, dono, "atribuído por menção/rodízio/…" e seletor de correção. Componentes novos em `src/features/admin/`; `admin.tsx` e `index.tsx` só importam.
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 11: Respostas rápidas em `/templates`

**Files:** Create `src/server/respostas-rapidas.ts`, `src/features/respostas-rapidas/filtro.ts`, `src/features/respostas-rapidas/filtro.test.ts`; Modify `src/routes/templates.tsx` (reescrita), `vite.config.ts`, `src/components/AppSidebar.tsx` (rótulo); Delete `src/lib/mock-data.ts`.
**Resources:** none. **Depends-on:** 2.

**Interfaces:**
- Produces: `listarRespostasRapidas(): RespostaRapida[]` (qualquer sessão, só ativas), `salvarRespostaRapida({ id?, atalho, texto, ativo })` e `removerRespostaRapida({ id })` (admin); `type RespostaRapida = { id: string; atalho: string; texto: string; ativo: boolean }`; `filtrarPorAtalho(lista, digitado: string): RespostaRapida[]` (texto começa com `/`, prefixo do atalho, até 8).
- [ ] Testes puros: `"/" lista todas ate 8`, `"/pre" filtra por prefixo`, `sem barra nao abre`.
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 12: Envio pelo app

**Files:** Create `src/server/envio.ts`, `src/server/envio.db.test.ts`, `src/features/conversa/Composer.tsx`, `src/features/conversa/gravador.ts`; Modify `src/routes/meus-leads.tsx`, `src/routes/index.tsx` (`Thread`), `src/server/motor/ingestao.ts`, `vite.config.ts`.
**Resources:** banco de teste. **Depends-on:** 5, 6, 11.

**Interfaces:**
- Produces: `envioDisponivel(): boolean` (server fn, `obterAdaptador() !== null`); `enviarMensagem({ leadId, envio: Omit<Envio,'telefone'> })` → `{ mensagemId }`, Zod por tipo (base64 até 16 MB), atendente só lead dele, admin qualquer, lead sem `opt_out`; chama `adaptador.enviar`, depois `registrarMensagem` com `autoria`. `registrarMensagem` com autoria faz `on conflict (evolution_msg_id) do update set usuario_id, enviada_por='app'`.
- [ ] Testes de banco: `atendente nao envia para lead de outro` (função de posse `podeEnviar(db, leadId, sessao)`), `eco antes do insert` (eco gravado como `celular`, depois insert do app → 1 linha `app` com `usuario_id`), `eco depois do insert nao duplica`.
- [ ] `Composer`: texto com `/` abrindo `filtrarPorAtalho`, anexo (imagem/vídeo/documento), áudio por `MediaRecorder`, localização por `navigator.geolocation`; aparece só quando `envioDisponivel()`; senão fica o aviso atual.
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 13 (BLOQUEADA): Adaptador Evolution Go a partir de eventos reais

**Bloqueio:** precisa do endpoint da Task 3 publicado e do dono apontando a instância e mandando os testes de §4.3 (texto recebido, texto pelo celular, áudio, imagem, vídeo, documento, localização, ack, queda/reconexão).
**Files:** Create `src/server/evolution/go.ts`, `src/server/evolution/go.test.ts`, `src/server/evolution/fixtures/*.json` (corpos reais com telefone e nome trocados), `src/routes/api/midia/$mensagemId.ts`; Modify `src/server/evolution/index.ts`, `.env.example` (`EVOLUTION_URL`, `EVOLUTION_INSTANCIA`, `EVOLUTION_API_KEY`).
**Depends-on:** 3, 5.

- [ ] Exportar os corpos de `webhook_eventos` (origem `evolution`), anonimizar, salvar como fixtures.
- [ ] Teste por fixture: `normalizar` devolve o `EventoNormalizado` esperado; `chaveDeOrdem` devolve o telefone/JID.
- [ ] Implementar `enviar`, `baixarMidia`, `estadoConexao` contra a instância real; decidir conversão de áudio OGG/Opus e guarda de mídia (§5.3, §11).
- [ ] Rota de mídia com a mesma regra de posse do envio.
- [ ] Antes de `MOTOR_ATIVO=1`, recalcular `chave_ordem` dos eventos capturados (`status = 'pendente'`, `chave_ordem = 'evolution'`) com `adaptador.chaveDeOrdem(corpo)`.
- [ ] Reprocessar os eventos capturados pelo monitor e conferir no app.

### Task 14: Corte na virada

**Files:** Create `db/migrations/0003_virada.sql`, `src/server/motor/virada.db.test.ts`, `docs/runbook-virada.md`.
**Resources:** banco de teste. **Depends-on:** 2.

- [ ] Teste de banco: depois do 0003, nenhum followup `pendente`, nenhum `qualificar_apos` não nulo, um evento `followup_cancelled` por followup e um `qualification_cleared` por lead afetado, `atendente_id` intacto; notificações pendentes de followup `cancelada`.
- [ ] Runbook em ordem: confirmar n8n desligado; `bun run db:migrate -- --ate 0002`; publicar imagem; configurar envs; apontar Evolution Go; capturar (Task 13); `bun run db:migrate` (aplica 0003); `MOTOR_ATIVO=1`; reprocessar capturados; conferir monitor e saúde.
- [ ] `bun run test:db` → PASS.

### Task 15: Documentação e fechamento

**Files:** Modify `docs/architecture.md`, `docs/onboarding.md`, `docs/quality.md`, `PRODUCT.md`, `.env.example`; Update `graphify-out/` (`graphify update .`).
**Depends-on:** todas as anteriores.

- [ ] Arquitetura: motor, fila, role, migrações, envs, tarefas; onboarding: `scripts/banco-teste.sh` + `bun run test:db`; quality: testes de banco e contagem de lint; PRODUCT: estado da fase 1 com o bloqueio da Task 13.
- [ ] Handoff (formato `docs/handoff.md.template`) no fim deste plano.
- [ ] `bun run check`, `bun run test:db`, `bun run build`, `git diff --check` → todos exit 0.

## Handoff (04/11/2026)

- Objetivo e aceite: fase 1 do WakeCRM (motor próprio no lugar do n8n). Aceite: `bun run check`, `bun run test:db`, `bun run build` e `git diff --check` com saída 0, e adaptador do Evolution Go validado com eventos reais (Task 13).
- Estado verificado: 04/11/2026, árvore de trabalho do branch `docs/wakecrm-motor-proprio`, sem commits das tasks 2 a 15 (AGENTS.md só permite commit sob pedido); nunca assuma árvore limpa.
- Concluído: Tasks 1 a 12, 14 e 15 (fila, ingestão, distribuição, saúde, push, super admin, respostas rápidas, envio pelo app, migrações 0001 a 0003, runbook da virada, documentação). Código em `src/server/motor/`, `src/server/webhooks/`, `src/server/evolution/`, `src/features/`, `db/migrations/`.
- Evidência (rodada na Task 15): `PROTO_BUN_VERSION=1.3.11 bun run check` exit 0 (lint 0 erros, 40 avisos herdados; tsc limpo; 27 pass, 53 skip; regras `quality/*` ok). `NOME=wakecrm-teste-t15 PORTA=54355 bash scripts/banco-teste.sh && PORTA=54355 bun run test:db` → 80 pass, 0 fail. `bun run build` exit 0. `git diff --check` sem saída. `graphify update .` → 1500 nós, 3210 arestas.
- Pendente: **Task 13** (capturar eventos reais do Evolution Go, escrever o adaptador, `chaveDeOrdem`, envio e mídia; erro HTTP do adaptador sem URL com apikey; confirmar corpo base64, limites de 25 MB e 16 MB das server fns, e mime `;codecs=opus`). Menores deferidos do ledger, por tema: runbook (backup antes do passo 7, referência à "Task 13", nota sobre triggers e 0003); testes faltando (saúde: heartbeat/ack, virada: controles negativos, notificações: `enviarPushPendentes`, `gravarEnvio`, retentativa futura); concorrência (trava global antes de `livre`, push com rede dentro da transação, pool max 8, `alterarAtendente` não atômico); UI (erros crus do pg/Zod no toast, `Number("")`, comentários "só leitura", extrair `RodapeConversa`, dividir `admin.tsx`); migração (CHECKs sem NOT VALID, `pg_constraint` sem `conrelid`, grants futuros exigem 0004).
- Bloqueios: Task 13 depende de eventos reais do Evolution Go. Sem ela não há publicação nem envio real. Retomar quando houver uma instância que gere os eventos para captura.
- Recursos: contêiner Docker `wakecrm-teste` (porta 54339) criado antes da Task 15 e ainda existente; removê-lo (`docker rm -f wakecrm-teste`) e quaisquer `wakecrm-teste-*` que sobrarem. O contêiner `wakecrm-teste-t15` já foi removido. `.output/` é artefato de build.
- Contexto a revisitar: a 0002 já pode ter rodado em algum ambiente (nesse caso mudanças exigem 0004); formato do webhook de vendas (fase 4); a porta 54329 pertence a outro projeto local.
