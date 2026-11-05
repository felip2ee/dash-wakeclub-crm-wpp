# WakeCRM · Pipeline por etapa, sinal "parado", varredura e revisão do admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar as oito etapas atuais pelas oito do funil real (movidas também pelos eventos `USER_*` do app), substituir o agendamento de follow-up por IA pelo sinal determinístico "parado", fazer a cota limitar envios (não preparo), adicionar varredura sob demanda, fila de envio com prioridade dos lembretes de aula e a revisão do admin como única fonte de aprendizado dos prompts.

**Architecture:** Uma migração (`0008`) muda a constraint de etapas, migra os dados, cria `app_eventos` (idempotência dos eventos do app), `followup_revisoes` (revisão do admin) e `varreduras` (progresso), e acrescenta colunas a `leads` e `followups`. O processador `vendas` da fila passa a tratar todo o envelope `USER_*` (`src/server/motor/app-eventos.ts`), movendo etapa e saldo de horas com evento de automação no mesmo comando. Uma tarefa nova (`parado`) cria follow-ups `pendente` tipo `parado`; o redator continua escrevendo; o envio ordena por prioridade (lembretes primeiro), valor esperado e idade, e para na cota do dia. A varredura reusa o detector e o redator sem cota. Telas novas: "Fila de envio" e "Revisão das decisões"; botão "Buscar follow-ups agora" em `/aprovar`.

**Tech Stack:** TanStack Start + React 19, TanStack Query, Tailwind v4 + shadcn/ui, PostgreSQL 14 via `pg` (só `src/server/db.ts`), Zod, Bun (`PROTO_BUN_VERSION=1.3.11`), `bun test`, Docker para o banco de teste.

**Spec:** `docs/superpowers/specs/2026-11-05-wakecrm-pipeline-e-followup-design.md` (§2, §5 incl. pagamento pendente, §6 e §13 são vinculantes). Fundo: `docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md` §7, `docs/architecture.md`.

## Global Constraints

- Etapas novas, exatamente estes textos: `Novo lead`, `Em atendimento`, `Link enviado`, `Cadastrado`, `Aguardando pagamento`, `Aluno com horas`, `Aluno sem horas`, `Encerrado` (spec §3). Nada mais passa em `leads_etiqueta_valida`.
- Etapas do app só avançam; exceções: `Aluno sem horas → Aluno com horas` em compra paga e `Aguardando pagamento → Cadastrado` 24 h depois de `USER_HOUR_PURCHASE_CREATED` sem `PAID` (spec §3, §5).
- `data.test === true` ou `"true"` nunca move etapa, nunca grava `app_eventos`, nunca cria lembrete (spec §3).
- Cada `USER_LESSON_ATTENDED` = 1 hora; saldo é do comprador (lead do próprio evento); saldo nunca fica negativo; hora sem saldo é registrada e visível em Configurações › Fila de eventos (spec §2, §4).
- Idempotência: aula por `booking_id|date|time_slot`; agendamento por `booking_id`; compra por `transaction_id` senão `payment_id`; cadastro por `user_id`. Reentrega não desconta hora duas vezes (spec §13).
- Nada sai sem humano tocar "Enviar". A cota do modo (conservador 20 / aquecido 60) limita **envios por dia** (São Paulo); preparo e decisão não têm limite (spec §2, §8). Janela 8h–19h59 e intervalo mínimo entre disparos continuam.
- Ordem da fila de envio: lembretes de aula (`lembrete_d1`, `lembrete_dia`) antes de tudo; depois maior valor esperado; depois mais antigo `aprovado_em` (spec §6, §8).
- Aprovado há mais de 3 dias passa de novo pelo porteiro antes de sair; barrado sai da fila com motivo (spec §8).
- Expiração às 19h59 só para `aguardando_aprovacao`: automático expira no mesmo dia; varredura expira 19h59 do dia seguinte (spec §8, §13).
- Só a revisão do admin (`followup_revisoes`) entra nos prompts; a decisão da atendente não. Mudou o bloco, muda `VERSAO_PROMPT` (spec §9). Admin decidindo direto conta como decisão + revisão.
- Toda decisão do motor vira linha em `eventos_automacao` no mesmo comando que muda o dado; nunca texto de conversa, prompt ou raciocínio (spec §12).
- Prazos de "parado" (padrão: 24 h / 24 h / 24 h / 7 dias / 15 dias; silêncio de 48 h para alunos; 24 h para pagamento pendente) configuráveis em Configurações (spec §5).
- Fuso `America/Sao_Paulo` em todo cálculo de dia e hora; casts SQL explícitos; `snake_case → camelCase` no servidor; datas como ISO string na fronteira.
- Migrações numeradas a partir de `0008` (a `0007_origem_e_meta.sql` pertence ao plano "visão comercial"). Esta migração não toca colunas `origem_*`.
- Este plano **não** edita `src/server/visao-geral.ts`, `src/features/visao-geral/*`, `src/routes/visao-geral.tsx` nem `src/routes/pipeline.tsx` (compartilhados com o plano "visão comercial"). Mudanças de Pipeline ficam em `src/lib/pipeline.ts`, `src/lib/etapas.ts`, `src/server/leads.ts` e `src/features/pipeline/*`. A única exceção é o filtro de `PipelinePorEtapa.tsx` (Task 13), que depende do merge do outro plano.
- `vite.config.ts` (`importProtection.client.excludeFiles`) e Git são do coordenador: cada task que cria módulo com `createServerFn` lista a linha a acrescentar; o coordenador aplica antes da wave.
- Commits por task em Conventional Commits em português; implementadores não commitam (o coordenador commita por task, em ordem de wave). Título do PR inclui "com migração".
- Bun sempre com `PROTO_BUN_VERSION=1.3.11`. Checagens: `bun run check`, `bun run build`, e testes de banco com contêiner próprio: `NOME=wakecrm-teste-pf<N> PORTA=5441<N> bash scripts/banco-teste.sh && PORTA=5441<N> bun run test:db <arquivo>`. Nunca o padrão `wakecrm-teste`/54339.

## Review Focus

1. `USER_HOUR_PURCHASE_PAID` reentregue (mesmo `transaction_id`) não soma horas de novo nem cria segundo `stage_changed` — teste na Task 4.
2. `USER_LESSON_ATTENDED` chegando antes de qualquer compra (saldo nulo ou 0) grava `hora_sem_saldo`, não deixa saldo negativo e não move etapa — teste na Task 4.
3. Mensagem do lead entre a aprovação e o envio cancela o `aprovado` comum, mas **não** cancela um lembrete de aula (`lembrete_d1`/`lembrete_dia`) — teste na Task 6.
4. Nenhum caminho envia além da cota: com `enviadosHoje >= cotaDia` o envio devolve 0 mesmo com aprovados na fila; a varredura só produz `aguardando_aprovacao`, nunca `aprovado`/`enviado` — testes nas Tasks 9 e 10.
5. Admin decidindo direto em `/aprovar` gera `followup_revisoes` (concorda = true) e a avaliação de uma atendente sem revisão **não** aparece no bloco do prompt — testes nas Tasks 7a e 7b.

## Waves

Regra: `Files` disjuntos, `Depends-on` satisfeito, banco de teste próprio por task (`NOME=wakecrm-teste-pf<N> PORTA=5441<N>`, N de 1 a 9, reaproveitado entre waves porque as waves são sequenciais). O coordenador aplica as linhas de `vite.config.ts` listadas antes da wave que precisa delas.

| Wave | Tasks | Banco por task | Observações |
|---|---|---|---|
| 1 | T1, T2, T3 | T1: pf1 / 54411; T2, T3: sem banco | T1 muda schema; T2 e T3 são puras |
| 2 | T4, T5, T6, T7b, T8, T13 | T4: pf1; T5: pf2; T6: pf3; T7b: pf4; T8: pf5; T13: sem banco | T13 só entra se o merge do plano "visão comercial" já aconteceu; senão vai para a wave 5 |
| 3 | T7a, T12, T14 | T7a: pf1; T14: pf2; T12: sem banco | vite: `src/server/prazos.ts` |
| 4 | T9, T10 | T9: pf1; T10: pf2 | vite: `src/server/admin-varredura.ts` |
| 5 | T11, (T13) | T11: pf1 | vite: `src/server/fila-envio.ts` |
| 6 | T15 | pf1 (suíte inteira) | boot, docs, `bun run check`, `bun run build`, `test:db` completo |

---

### Task 1: Migração 0008 e views do painel

**Files:**
- Create: `db/migrations/0008_pipeline_etapas.sql`
- Create: `src/server/motor/migracoes-0008.db.test.ts`
- Modify: `db/painel-views.sql` (listas `VALUES` de `v_conversas_painel`, `v_leads_painel`, `v_relatorio_funil`)

**Resources:** banco `NOME=wakecrm-teste-pf1 PORTA=54411`. **Depends-on:** none.

**Interfaces:**
- Produces (schema):
  - `leads`: constraint `leads_etiqueta_valida` com as oito etapas novas; `default 'Novo lead'`; colunas `saldo_horas integer` (null = desconhecido), `proxima_aula_em timestamptz`, `ultima_aula_em timestamptz`, `ultimo_evento_app_em timestamptz`, `pagamento_pendente_desde timestamptz`, `app_user_id text` (índice parcial único onde não nulo).
  - `followups`: `followups_tipo_valido` passa a aceitar também `'parado'`; colunas `expira_em timestamptz`, `reconferido_em timestamptz`, `aula_em timestamptz`. Índice `followups_um_pendente_por_lead` recriado com `where status in ('pendente','aguardando_aprovacao','aprovado','enviando') and tipo not in ('lembrete_d1','lembrete_dia')`; novo `followups_um_lembrete_por_lead_tipo unique (lead_id, tipo) where status in (...) and tipo in ('lembrete_d1','lembrete_dia')`.
  - `app_eventos (id bigserial pk, tipo text check in ('cadastro','agendamento','aula','compra_pendente','compra_paga'), chave text, lead_id uuid null references leads, ocorrido_em timestamptz, recebido_em timestamptz default now(), resultado text check in ('aplicado','hora_sem_saldo','saldo_desconhecido','sem_lead'), dados jsonb default '{}', unique (tipo, chave))`.
  - `followup_revisoes (id uuid pk, avaliacao_id uuid unique references followup_avaliacoes, admin_id uuid references usuarios, concorda boolean not null, observacao text, criado_em timestamptz default now())`.
  - `varreduras (id uuid pk, iniciada_por uuid references usuarios, iniciada_em timestamptz default now(), concluida_em timestamptz, status text check in ('rodando','concluida','falhou'), total int default 0, analisados int default 0, sugeridos int default 0, barrados int default 0, erro text)`; índice único parcial `varreduras_uma_rodando where status = 'rodando'`.
  - `configuracoes`: `('prazos_parado', '{"em_atendimento_h":24,"link_enviado_h":24,"cadastrado_h":24,"aluno_com_horas_dias":7,"aluno_sem_horas_dias":15,"silencio_alunos_h":48,"pagamento_pendente_h":24}')` com `on conflict do nothing`.
  - Grants: `wakecrm_motor` select/insert/update em `app_eventos`, `varreduras`; select/insert em `followup_revisoes`; `painel_ro` select em `followup_revisoes` (guardado por existência da role). Sem role motor a migração falha alto (padrão da 0004).
  - Dados: `update leads set etiqueta = case ... end` conforme §3: `Novo Lead → Novo lead`; `Atendimento → Em atendimento`; `Agendado`/`Aula realizada → Aluno com horas` se existe `vendas` paga com `lead_id = leads.id`, senão `Em atendimento`; `Follow-up → coalesce((select e.estado_anterior->>'etiqueta' from eventos_automacao e where e.lead_id = l.id and e.tipo_evento = 'stage_changed' and e.estado_novo->>'etiqueta' = 'Follow-up' order by e.ocorrido_em desc limit 1) mapeado pela mesma tabela, 'Em atendimento')`; `Negociação encerrada → Encerrado`. `saldo_horas` dos migrados para `Aluno com horas` = soma de `vendas.horas` pagas (null se alguma venda paga tem `horas` nulo). `expira_em` dos `aguardando_aprovacao` existentes = 19:59:59 SP do dia de `sugerido_em`. A constraint nova entra **depois** do update.

- [ ] **Step 1: Escrever o teste de banco que falha**

```ts
// src/server/motor/migracoes-0008.db.test.ts — describe.skipIf(!bancoTesteAtivo)("migração 0008")
test("etiqueta antiga é rejeitada e as oito novas aceitas", ...)   // 23514 para 'Atendimento'; insert ok para cada uma das 8
test("default de etiqueta é 'Novo lead'", ...)
test("followups aceita tipo 'parado' e dois lembretes abertos de tipos diferentes no mesmo lead", ...)
test("dois 'parado' abertos no mesmo lead violam 23505; dois lembrete_d1 abertos também", ...)
test("app_eventos: unique (tipo, chave) → 23505; resultado inválido → 23514", ...)
test("followup_revisoes: avaliacao_id único; painel_ro lê, painel_rw não (42501)", ...)
test("varreduras: segunda linha 'rodando' → 23505", ...)
test("prazos_parado existe em configuracoes com pagamento_pendente_h = 24", ...)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `NOME=wakecrm-teste-pf1 PORTA=54411 bash scripts/banco-teste.sh && PORTA=54411 PROTO_BUN_VERSION=1.3.11 bun run test:db src/server/motor/migracoes-0008.db.test.ts`
Expected: FAIL (constraint antiga aceita 'Atendimento'; tabelas não existem).

- [ ] **Step 3: Escrever `db/migrations/0008_pipeline_etapas.sql`** idempotente (`if not exists`, `drop constraint if exists`), na ordem: colunas → update de dados → constraints/índices → tabelas → grants. Cabeçalho com spec e §3 do mapeamento. Em `db/painel-views.sql`, trocar as três listas `VALUES` para `('Novo lead',1),('Em atendimento',2),('Link enviado',3),('Cadastrado',4),('Aguardando pagamento',5),('Aluno com horas',6),('Aluno sem horas',7),('Encerrado',8)`.

- [ ] **Step 4: Rodar e ver passar**

Run: mesmo comando do Step 2 (o script recria o banco e aplica todas as migrações). Expected: PASS. Também `bash scripts/banco-teste.sh` reaplica 0001/0002 por cima sem erro.

- [ ] **Step 5: Commit** (coordenador) — `feat(db): migração 0008 com etapas novas, app_eventos, revisões e varreduras`

---

### Task 2: Etapas puras, transições e valor esperado

**Files:**
- Create: `src/lib/etapas.ts`, `src/lib/etapas.test.ts`
- Modify: `src/lib/pipeline.ts` (importa `ETAPAS` de `./etapas`), `src/lib/pipeline.test.ts`
- Modify: `src/server/motor/valor.ts`, `src/server/motor/valor.test.ts`

**Resources:** nenhum. **Depends-on:** none.

**Interfaces:**
- Produces em `src/lib/etapas.ts`:
  - `export const ETAPAS = ["Novo lead","Em atendimento","Link enviado","Cadastrado","Aguardando pagamento","Aluno com horas","Aluno sem horas","Encerrado"] as const; export type Etapa = (typeof ETAPAS)[number];`
  - `export const ETAPAS_DA_IA: readonly Etapa[] = ["Novo lead","Em atendimento","Link enviado","Encerrado"];`
  - `export function ordemDa(etapa: string): number` (1..8; desconhecida → 99).
  - `export type TipoEventoApp = "cadastro" | "agendamento" | "aula" | "compra_pendente" | "compra_paga";`
  - `export function proximaEtapa(atual: string, evento: TipoEventoApp, saldoDepois: number | null): Etapa | null` — `cadastro` → `Cadastrado` se `ordemDa(atual) < 4`; `compra_pendente` → `Aguardando pagamento` se `ordemDa(atual) < 5`; `compra_paga` → `Aluno com horas` se `ordemDa(atual) < 6` ou `atual === "Aluno sem horas"`; `aula` → `Aluno sem horas` se `atual === "Aluno com horas" && saldoDepois === 0`, `Aluno com horas` se `saldoDepois !== null && saldoDepois > 0 && ordemDa(atual) < 6`; `agendamento` → `null`; `Encerrado` nunca muda por evento do app (spec §3 "só avançam"); senão `null`.
  - `export function etiquetaDaIa(devolvida: string, atual: string): Etapa | string` — aceita legados (`"Novo Lead"→"Novo lead"`, `"Atendimento"→"Em atendimento"`, `"Negociação encerrada"`/`"Negociacao encerrada"→"Encerrado"`); fora de `ETAPAS_DA_IA` → `atual`; se `ordemDa(atual) >= 4` e o resultado não é `Encerrado` → `atual` (a IA não rebaixa etapa do app).
- Produces em `valor.ts`: `CHANCES` nas etapas novas: `"Aguardando pagamento": 0.7/0.7/0.7`, `Cadastrado: 0.4/0.3/0.2`, `"Link enviado": 0.4/0.2/0.2`, `"Em atendimento": 0.25/0.12/0.04`, `"Novo lead": 0.05/0.05/0.05`, `"Aluno sem horas": 0.3/0.15/0.05`; `FORA_DO_PIPELINE = {"Encerrado","Aluno com horas"}`; remove `agendadoNoPassado`. Assinaturas de `valorCheio`/`valorEsperado` inalteradas.

- [ ] **Step 1: Testes que falham**

```ts
// etapas.test.ts
expect(proximaEtapa("Novo lead", "cadastro", null)).toBe("Cadastrado");
expect(proximaEtapa("Aluno com horas", "cadastro", null)).toBeNull();          // só avança
expect(proximaEtapa("Aluno sem horas", "compra_paga", 4)).toBe("Aluno com horas"); // exceção
expect(proximaEtapa("Encerrado", "compra_paga", 4)).toBeNull();
expect(proximaEtapa("Aluno com horas", "aula", 0)).toBe("Aluno sem horas");
expect(proximaEtapa("Aluno com horas", "aula", 2)).toBeNull();
expect(proximaEtapa("Cadastrado", "aula", 3)).toBe("Aluno com horas");        // PAID perdido
expect(proximaEtapa("Cadastrado", "agendamento", null)).toBeNull();
expect(etiquetaDaIa("Atendimento", "Novo lead")).toBe("Em atendimento");
expect(etiquetaDaIa("Novo lead", "Cadastrado")).toBe("Cadastrado");            // não rebaixa
expect(etiquetaDaIa("Negociacao encerrada", "Aluno com horas")).toBe("Encerrado");
expect(etiquetaDaIa("Aguardando pagamento", "Link enviado")).toBe("Link enviado"); // etapa do app
// pipeline.test.ts: ETAPAS[0] === "Novo lead", ETAPAS[7] === "Encerrado"; "Em atendimento" no lugar de "Atendimento"
// valor.test.ts: Aluno com horas → 0; Aluno sem horas quente 4h × 360 → 432; Cadastrado morno 1h → 108
```

- [ ] **Step 2: Rodar** `PROTO_BUN_VERSION=1.3.11 bun test src/lib src/server/motor/valor.test.ts` — Expected: FAIL (módulo não existe / valores antigos).
- [ ] **Step 3: Implementar** `src/lib/etapas.ts`, ajustar `pipeline.ts` e `valor.ts`.
- [ ] **Step 4: Rodar** mesmo comando — Expected: PASS. `bun run typecheck` vai falhar em callers de etapas antigas (`ColunaEtapa.tsx`, `PipelinePorEtapa.tsx`): esperado até as Tasks 13; não corrigir aqui.
- [ ] **Step 5: Commit** — `feat(etapas): etapas novas, transições do app e valor esperado`

---

### Task 3: Normalizador dos eventos do app

**Files:**
- Create: `src/server/vendas/eventos-app.ts`, `src/server/vendas/eventos-app.test.ts`

**Resources:** nenhum. **Depends-on:** none. (`normalizar.ts` não muda: `USER_HOUR_PURCHASE_PAID` continua virando `VendaNormalizada` por ele.)

**Interfaces:**
- Produces:
```ts
export type PessoaApp = { userId: string | null; cpf: string | null; telefone: string | null; nome: string | null };
export type EventoApp = { ocorridoEm: string; pessoa: PessoaApp; chave: string } & (
  | { tipo: "cadastro" }
  | { tipo: "agendamento"; bookingId: string; aulaEm: string /* ISO, date+time_slot em SP */; modalidade: string | null }
  | { tipo: "aula"; bookingId: string; aulaEm: string; atendidaEm: string }
  | { tipo: "compra_pendente"; paymentId: string; horas: number | null; valor: number | null }
  | { tipo: "compra_paga"; horas: number | null }
);
export function normalizarEventoApp(corpo: unknown): EventoApp | { ignorar: string } | { erro: string };
```
  - Envelope `{ event: "USER_*", timestamp, data }`; `data.test === true | "true"` → `{ ignorar: "evento de teste do app" }`; `USER_CONTRACT_SIGNED` e desconhecidos → `{ ignorar }`. `chave`: cadastro = `user_id`; agendamento = `booking_id`; aula = `booking_id|date|time_slot`; compra_pendente = `payment_id`; compra_paga = `transaction_id ?? payment_id`. Campo-chave ausente → `{ erro: "formato desconhecido: sem <campo>" }`. `aulaEm` = `date "YYYY-MM-DD"` + `time_slot "HH:MM"` interpretados em `America/Sao_Paulo` (use `Intl`/offset como `src/lib/formato.ts`; não `new Date("YYYY-MM-DDTHH:MM")`). Pessoa: `user_id`/`user.id`, `cpf` (11 dígitos ou null, reaproveitar regra de `normalizar.ts` exportando `lerCpf`/`lerTelefone` dali), `phone`, `full_name`/`name`. `ocorridoEm` = `timestamp` do envelope, senão agora.

- [ ] **Step 1: Testes que falham** — um caso por evento real (payloads sintéticos com os nomes de campo do contexto), mais: `test:"true"` ignora; sem `booking_id` → erro; aula `date 2026-11-10` + `time_slot 14:00` → `aulaEm === "2026-11-10T17:00:00.000Z"`; `PAID` sem `transaction_id` usa `payment_id`.
- [ ] **Step 2: Rodar** `bun test src/server/vendas/eventos-app.test.ts` — FAIL.
- [ ] **Step 3: Implementar** `eventos-app.ts`; exportar `lerCpf` e `lerTelefone` de `normalizar.ts` (sem mudar comportamento).
- [ ] **Step 4: Rodar** — PASS; `bun test src/server/vendas` continua verde.
- [ ] **Step 5: Commit** — `feat(vendas): normalizador dos eventos USER_* do app`

---

### Task 4: Processador dos eventos do app (etapa, saldo, lembretes)

**Files:**
- Create: `src/server/motor/app-eventos.ts`, `src/server/motor/app-eventos.db.test.ts`
- Modify: `src/server/motor/vendas.ts` (`criarProcessadorVendas`, `export cruzar`, `vincular`), `src/server/motor/vendas.db.test.ts` (só se um teste existente depender de etiqueta antiga)

**Resources:** banco pf1 / 54411. **Depends-on:** T1, T2, T3.

**Interfaces:**
- Consumes: `normalizarEventoApp`, `EventoApp` (T3); `proximaEtapa` (T2); `normalizarVenda`, `processarVenda` (existentes).
- Produces em `app-eventos.ts`:
  - `export async function processarEventoApp(db: PoolClient, ev: EventoApp, corpoBruto: unknown): Promise<"processado" | "ignorado">`. Passos, todos na transação do chamador: (1) `insert into app_eventos (tipo, chave, ocorrido_em, dados) ... on conflict (tipo, chave) do nothing returning id` — sem linha → `"ignorado"` (reentrega). (2) `localizarLead(db, pessoa)`: `app_user_id`, depois `cpf`, depois `telefone` (reaproveita `cruzar` exportado de `vendas.ts`); sem lead → `resultado = 'sem_lead'`, `"processado"`. Com lead: grava `app_user_id`/`cpf` se nulos. (3) `aplicar` por tipo, **num só comando SQL** com CTEs: update em `leads` (`etiqueta` se `proximaEtapa` ≠ null, `saldo_horas`, `proxima_aula_em`, `ultima_aula_em`, `ultimo_evento_app_em = ocorrido_em`, `pagamento_pendente_desde`), cancelamento dos follow-ups abertos não lembretes (`motivo_cancelamento = 'evento do app: <tipo>'`, notificações canceladas) e `eventos_automacao` (`agente 'app'`, `gatilho 'webhook'`, `origem_id` = id do app_evento, `correlacao_id 'motor:app:' || app_evento.id`): `stage_changed` quando a etapa muda, `hours_balance_changed` quando o saldo muda, `class_booked` no agendamento, `lesson_without_balance` quando a aula não desconta, `followup_cancelled` por follow-up cancelado. (4) `app_eventos.resultado` = `aplicado` | `hora_sem_saldo` | `saldo_desconhecido`.
  - Regras de saldo: `compra_paga` com `horas` → `saldo = coalesce(saldo,0) + horas`; sem `horas` → `saldo = null` (desconhecido, spec §13). `aula`: saldo null → `saldo_desconhecido`, não desconta; saldo 0 → `hora_sem_saldo`; saldo > 0 → `saldo - 1`; `ultima_aula_em = atendidaEm`; `proxima_aula_em = null` se `proxima_aula_em <= atendidaEm`. `agendamento`: `proxima_aula_em = least(coalesce(proxima_aula_em, aulaEm), aulaEm)` só quando `aulaEm > now()`. `compra_pendente`: `pagamento_pendente_desde = ocorridoEm`. `compra_paga`: `pagamento_pendente_desde = null`.
  - Lembretes (spec §6), só em `agendamento` com lead e `aulaEm > now()`: `criarLembretes(db, leadId, aulaEm, appEventoId)` insere `followups (lead_id, tipo, agendado_para, motivo, aula_em, status 'pendente')` para `lembrete_d1` em `aulaEm - 1 dia às 10:00 SP` e `lembrete_dia` em `aulaEm às 08:00 SP`, cada um com `agendado_para = greatest(nominal, now())` e só se `aulaEm - now() >= 2 h`; `where not exists` lembrete aberto do mesmo tipo no lead; `motivo = 'aula em <YYYY-MM-DD HH:MM> (<modalidade>)'`; evento `followup_created` agente `'app'`.
  - `export async function avancarPorVendaVinculada(db: PoolClient, leadId: string, horas: number | null): Promise<void>` — mesma regra de `compra_paga` sem `app_eventos` (usada por `vincular`).
- Produces em `vendas.ts`: `criarProcessadorVendas()` passa a: `normalizarEventoApp(corpo)` → `erro` ⇒ `ErroPermanente`; `ignorar` ⇒ `"ignorado"`; `compra_paga` ⇒ `processarVenda(db, normalizarVenda(corpo), corpo)` **e depois** `processarEventoApp` (o lead da venda é o mesmo); demais ⇒ `processarEventoApp`. `vincular(...)` chama `avancarPorVendaVinculada` após o vínculo. Envelope não-`USER_*` segue o caminho flat atual.

- [ ] **Step 1: Testes de banco que falham** (`app-eventos.db.test.ts`, lead criado via `registrarMensagem` + `atendente_id` como em `vendas.db.test.ts`):

```ts
test("cadastro move Novo lead → Cadastrado, grava app_user_id e stage_changed agente app")
test("compra_pendente → Aguardando pagamento com pagamento_pendente_desde; PAID depois → Aluno com horas, saldo = hours, pendente limpo")
test("PAID reentregue (mesma transaction_id) → 'ignorado', saldo não dobra, um só stage_changed")   // Review Focus 1
test("aula sem compra: saldo fica null, resultado saldo_desconhecido, etapa não muda; com saldo 0: hora_sem_saldo, lesson_without_balance")  // Review Focus 2
test("duas aulas com saldo 2 → saldo 0 e Aluno sem horas; terceira → hora_sem_saldo")
test("Aluno sem horas + PAID 4h → Aluno com horas, saldo 4")
test("PAID sem hours → Aluno com horas com saldo null")
test("agendamento futuro cria lembrete_d1 e lembrete_dia pendentes com aula_em, não muda etapa, cancela 'parado' aberto; agendamento reentregue não duplica")
test("agendamento para daqui a 1h não cria lembrete")
test("evento com data.test 'true' → ignorado, sem app_eventos, etiqueta igual")
test("evento de pessoa desconhecida → app_eventos.resultado = 'sem_lead', lead_id null")
test("Encerrado + PAID → continua Encerrado, saldo atualizado")
test("vincular (admin) move o lead para Aluno com horas")
```

- [ ] **Step 2: Rodar** `NOME=wakecrm-teste-pf1 PORTA=54411 bash scripts/banco-teste.sh && PORTA=54411 bun run test:db src/server/motor/app-eventos.db.test.ts` — FAIL.
- [ ] **Step 3: Implementar** `app-eventos.ts` e as mudanças em `vendas.ts`. Comentário de cabeçalho explicando por que o módulo existe.
- [ ] **Step 4: Rodar** o teste novo e `PORTA=54411 bun run test:db src/server/motor/vendas.db.test.ts` — PASS.
- [ ] **Step 5: Commit** — `feat(motor): eventos do app movem etapa, saldo de horas e lembretes de aula`

---

### Task 5: Prompts e qualificador nas etapas novas

**Files:**
- Modify: `src/server/ia/prompts/extrair.mjs`, `src/server/ia/prompts/qualificador.ts`, `src/server/ia/prompts/porteiro.ts`, `src/server/ia/prompts/redator.ts` (os três gerados), `src/server/ia/prompts/prompts.test.ts`
- Modify: `src/server/motor/qualificador.ts`, `src/server/motor/qualificador.test.ts`, `src/server/motor/qualificador.db.test.ts`

**Resources:** banco pf2 / 54412. **Depends-on:** T2.

**Interfaces:**
- Consumes: `etiquetaDaIa`, `ETAPAS` (T2).
- Produces (prompts): versões `motor-qualificador-2026-11-05`, `motor-porteiro-2026-11-05`, `motor-redator-2026-11-05`. Sufixos acrescentados ao fim pelo `extrair.mjs` (texto fixo, copiado verbatim):
  - qualificador, depois de `HORAS`: `"\n\n  ETAPAS (substitui a lista ETIQUETAS acima)\n\n  Devolva etiqueta como uma destas: Novo lead, Em atendimento, Link enviado, Encerrado.\n  Cadastrado, Aguardando pagamento, Aluno com horas e Aluno sem horas são movidas pelo app de\n  agendamentos, nunca por voce; se o lead ja esta numa delas, repita a etiqueta atual.\n  O campo followup nao e mais usado: devolva null. Quem decide o follow-up e o sinal \"parado\" do CRM."` e `ajustarSchema`: `schema.properties.etiqueta.enum = [...ETAPAS]`.
  - porteiro e redator, antes de `{{AVALIACOES}}`: `"\n\n  ETAPA E OBJETIVO\n\n  O contexto traz ETIQUETA (a etapa do funil) e OBJETIVO DESTE FOLLOW-UP (o que o CRM quer que\n  este toque consiga). Escreva ou avalie para esse objetivo; um lembrete de aula nunca e venda."`.
  - `prompts.test.ts` confere legado + sufixos e as três versões.
- Produces (qualificador): `ETIQUETAS` removido; `validarQualificacao` usa `etiquetaDaIa(texto(c.etiqueta,60), ctx.etiquetaAtual)`; `followup` sempre `null` (campo lido e descartado); `SQL_AGENDAR` e `TIPOS` removidos; `SQL_GRAVAR` cancela só `tipo not in ('lembrete_d1','lembrete_dia')`; `ou(l.etiqueta, "Novo lead")`. `tarefaQualificador(deps: { ia: ClienteIa }): Promise<number>` inalterada.

- [ ] **Step 1: Testes que falham** — `prompts.test.ts` com os sufixos/versões; `qualificador.test.ts`: `validarQualificacao({etiqueta:"Atendimento",...}, {etiquetaAtual:"Novo lead",...}).etiqueta === "Em atendimento"`; `etiquetaAtual "Cadastrado"` + IA `"Novo lead"` → `"Cadastrado"`; `followup` devolvido pela IA → `null`. `qualificador.db.test.ts`: lead em `Cadastrado` qualificado para `Em atendimento` fica `Cadastrado` sem `stage_changed`; requalificação cancela `parado` pendente mas não `lembrete_d1`; nenhum `followup_created` do qualificador.
- [ ] **Step 2: Rodar** `bun test src/server/ia src/server/motor/qualificador.test.ts` e `PORTA=54412 bun run test:db src/server/motor/qualificador.db.test.ts` (após `NOME=wakecrm-teste-pf2 PORTA=54412 bash scripts/banco-teste.sh`) — FAIL.
- [ ] **Step 3: Implementar**: editar `extrair.mjs`, rodar `node src/server/ia/prompts/extrair.mjs`, ajustar `qualificador.ts`.
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat(ia): prompts nas etapas novas e qualificador sem agendar follow-up`

---

### Task 6: Ingestão e leitores antigos nas etapas novas

**Files:**
- Modify: `src/server/motor/ingestao.ts`, `src/server/motor/ingestao.db.test.ts`
- Modify: `src/server/motor/distribuicao.ts:68`, `src/server/followups.ts:139`, `src/routes/kanban.tsx:36-43`

**Resources:** banco pf3 / 54413. **Depends-on:** T1, T2.

**Interfaces:**
- Produces em `ingestao.ts` (`registrarMovimento`): opt-out → `etiqueta = 'Encerrado'`; mensagem da equipe com `etiqueta = 'Novo lead'` → `'Em atendimento'` com `stage_changed` (agente `'sistema'`, decisão `'Novo lead -> Em atendimento'`, motivo `'equipe respondeu'`) no mesmo comando; cancelamento por conversa viva/opt-out exclui `tipo in ('lembrete_d1','lembrete_dia')` (opt-out cancela tudo, inclusive lembretes). `registrarMensagem` inalterada.
- `distribuicao.ts` e `followups.ts`: `<> 'Encerrado'`. `kanban.tsx`: cores pelas oito etapas novas.

- [ ] **Step 1: Testes que falham** (`ingestao.db.test.ts`): equipe responde a `Novo lead` → `Em atendimento` + 1 `stage_changed`; segunda resposta não gera outro; mensagem do lead cancela `parado` aprovado mas deixa `lembrete_dia` aprovado (Review Focus 3); opt-out → `Encerrado` e cancela lembrete também.
- [ ] **Step 2: Rodar** `NOME=wakecrm-teste-pf3 PORTA=54413 bash scripts/banco-teste.sh && PORTA=54413 bun run test:db src/server/motor/ingestao.db.test.ts src/server/motor/distribuicao.db.test.ts` — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat(ingestao): etapas novas, Em atendimento ao responder e lembretes preservados`

---

### Task 7a: Redator — revisões do admin, objetivo, validade e sem cota de preparo

**Files:**
- Modify: `src/server/motor/redator.ts`, `src/server/motor/redator-sql.ts`, `src/server/motor/redator.test.ts`, `src/server/motor/redator.db.test.ts`

**Resources:** banco pf1 / 54411. **Depends-on:** T1, T5.

**Interfaces:**
- Consumes: prompts com `{{AVALIACOES}}` e versões `2026-11-05` (T5); `followup_revisoes`, `followups.expira_em` (T1).
- Produces:
  - `export type Revisao = { texto_original: string | null; texto_enviado: string | null; decisao: string; motivos: string[]; texto_livre: string | null; concorda: boolean; observacao: string | null }`; `SQL_REVISOES` (10 mais recentes, `join followup_avaliacoes`); `export function formatarRevisoes(r: Revisao[]): string` — título `"REVISOES DO ADMIN SOBRE DECISOES DA EQUIPE (calibre-se por elas)\n"`, uma linha por revisão: `"<texto IA>" → atendente: <decisao> (<motivos; texto_livre ou 'sem motivo'>) → admin: Concordo|Discordo: <observacao ou 'sem observação'>`; vazio → `"(nenhuma revisão ainda)"`. `export async function blocoRevisoes(db: ClienteDb): Promise<string>`. `formatarAvaliacoes`, `blocoAvaliacoes`, `SQL_AVALIACOES` e `Avaliacao` removidos.
  - `montarPromptPorteiro`/`montarPromptRedator`: linha `"OBJETIVO DESTE FOLLOW-UP: " + (d.motivo || "-")` no lugar de "motivo de quem agendou"/"por que foi agendado"; `data_agendada_local` no `SQL_BUSCAR` passa a `coalesce(l.proxima_aula_em, l.data_agendada)`.
  - `modoDoFollowup`: `ETAPAS_CONCRETAS = ["aguardando pagamento","cadastrado","aluno com horas","aluno sem horas"]`.
  - `SQL_GRAVAR` recebe `$7::int diasValidade` e grava `expira_em = ((now() at time zone 'America/Sao_Paulo')::date + $7 * interval '1 day' + interval '19 hours 59 minutes 59 seconds') at time zone 'America/Sao_Paulo'`.
  - `export type ResultadoRedacao = { sugeridos: number; barrados: { followupId: string; motivo: string }[]; reagendados: number; falhas: number }`.
  - `export async function redigir(db: ClienteDb, ia: ClienteIa, ids: string[], opcoes: { diasValidade: 0 | 1; aoConcluirUm?: (parcial: ResultadoRedacao) => Promise<void> }): Promise<ResultadoRedacao>` — laço atual de `tarefaRedator` extraído (busca, porteiro, redator, `aplicar`, reagendar em falha).
  - `export async function avaliarPorteiro(db: ClienteDb, ia: ClienteIa, followupId: string): Promise<{ enviar: boolean; motivo: string }>` — `SQL_FICHA` (como `SQL_BUSCAR` mas por id único, sem filtro de status) + `montarPromptPorteiro` + `validarPorteiro`; reagendar conta como `enviar: false`.
  - `tarefaRedator(deps: { ia: ClienteIa; agora?: Date }): Promise<number>` — sem `lerRitmo`/`preparadosHoje`; só janela; até 10 vencidos por valor esperado; chama `redigir(..., { diasValidade: 0 })`.

- [ ] **Step 1: Testes que falham** — `redator.test.ts`: `formatarRevisoes` com e sem itens (formato exato), `modoDoFollowup({etiqueta:"Cadastrado",tipo:"parado",...}).modo === "RETOMAR"`, `montarPromptRedator` contém `"OBJETIVO DESTE FOLLOW-UP: concluir o cadastro"`; `redator.db.test.ts` (cliente falso): `redigir` grava `expira_em` em 19:59:59 SP de hoje com `diasValidade 0` e de amanhã com 1; `blocoRevisoes` ignora avaliação sem revisão (Review Focus 5) e inclui a revisada; `tarefaRedator` prepara mesmo com 60 `sugerido_em` hoje (sem cota de preparo); `avaliarPorteiro` em `aprovado` devolve `{enviar:false, motivo}` quando o falso barra.
- [ ] **Step 2: Rodar** `bun test src/server/motor/redator.test.ts` e `NOME=wakecrm-teste-pf1 PORTA=54411 bash scripts/banco-teste.sh && PORTA=54411 bun run test:db src/server/motor/redator.db.test.ts` — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat(redator): revisões do admin no prompt, objetivo, validade e preparo sem cota`

---

### Task 7b: Decisão da atendente e revisão do admin (servidor)

**Files:**
- Modify: `src/server/aprovacao.ts`, `src/server/aprovacao.db.test.ts`
- Create: `src/server/revisao.ts`, `src/server/revisao.db.test.ts`

**Resources:** banco pf4 / 54414. **Depends-on:** T1. vite: `"**/src/server/revisao.ts"`.

**Interfaces:**
- Produces em `aprovacao.ts`: `decidir(db, sessao, entrada, agora?)` devolve `Promise<{ avaliacaoId: string }>`; expiração checada por `f.expira_em !== null && f.expira_em <= agora` (import de `expiradoPorHorario` removido; `expira_em` entra no select); se `sessao.papel === "admin"` insere `followup_revisoes (avaliacao_id, admin_id, concorda = true, observacao = textoLivre ?? null)` e evento `review_recorded` (agente `'humano'`, entidade `followup`, `metadados.automatica = true`) na mesma transação.
- Produces em `revisao.ts`:
```ts
export type DecisaoParaRevisar = { avaliacaoId: string; followupId: string; leadNome: string | null; telefone: string; vendedorNome: string; decisao: "enviar" | "recusar"; motivos: string[]; textoLivre: string | null; textoOriginal: string | null; textoEnviado: string | null; etiqueta: string; decididoEm: string };
export async function listarParaRevisar(db: ClienteDb, dias: number): Promise<DecisaoParaRevisar[]>; // sem revisão, criado_em >= now() - dias, ordem desc
export async function revisar(db: PoolClient, adminId: string, entrada: { avaliacaoId: string; concorda: boolean; observacao?: string }): Promise<void>; // insert + evento review_recorded; 23505 → Error("Esta decisão já foi revisada.")
export const listarDecisoesParaRevisar = createServerFn({ method: "GET" }).validator(z.object({ dias: z.number().int().min(1).max(90).default(7) })) ...  // exigirAdmin
export const revisarDecisao = createServerFn({ method: "POST" }).validator(z.object({ avaliacaoId: z.string().uuid(), concorda: z.boolean(), observacao: z.string().trim().max(500).optional() })) ... // exigirAdmin, comTransacao
```

- [ ] **Step 1: Testes que falham** — `aprovacao.db.test.ts`: atendente decide → nenhuma `followup_revisoes`; admin decide → uma revisão `concorda = true` com `observacao` = texto livre (Review Focus 5); follow-up com `expira_em` no passado → `"Follow-up expirou"`. `revisao.db.test.ts`: `listarParaRevisar` traz a decisão sem revisão e não traz a revisada; `revisar` grava e gera `review_recorded`; segunda revisão da mesma avaliação lança.
- [ ] **Step 2: Rodar** `NOME=wakecrm-teste-pf4 PORTA=54414 bash scripts/banco-teste.sh && PORTA=54414 bun run test:db src/server/aprovacao.db.test.ts src/server/revisao.db.test.ts` — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat(revisao): admin revisa decisões da equipe; decisão direta do admin já conta como revisão`

---

### Task 8: Detector "parado" e pagamento pendente

**Files:**
- Create: `src/server/motor/parado.ts`, `src/server/motor/parado.test.ts`, `src/server/motor/parado.db.test.ts`

**Resources:** banco pf5 / 54415. **Depends-on:** T1, T2.

**Interfaces:**
- Produces:
```ts
export type Prazos = { emAtendimentoH: number; linkEnviadoH: number; cadastradoH: number; alunoComHorasDias: number; alunoSemHorasDias: number; silencioAlunosH: number; pagamentoPendenteH: number };
export const PRAZOS_PADRAO: Prazos = { emAtendimentoH: 24, linkEnviadoH: 24, cadastradoH: 24, alunoComHorasDias: 7, alunoSemHorasDias: 15, silencioAlunosH: 48, pagamentoPendenteH: 24 };
export const schemaPrazos: z.ZodType<Prazos>; // inteiros 1..720 (horas) e 1..90 (dias)
export function prazosDe(valor: unknown): Prazos;               // jsonb snake_case → Prazos, campo ausente/inválido = padrão
export async function lerPrazos(db: ClienteDb): Promise<Prazos>;
export async function gravarPrazos(db: ClienteDb, p: Prazos): Promise<void>; // upsert chave 'prazos_parado'
export const OBJETIVOS = { "Em atendimento": "retomar o interesse", "Link enviado": "concluir o cadastro", Cadastrado: "escolher pacote e pagar", "Aluno com horas": "agendar a próxima aula", "Aluno sem horas": "recompra de horas", pagamento_cancelado: "concluir a compra do pacote que ficou pendente" } as const;
export const SQL_PARADOS: string; // select l.id, l.etiqueta ... (predicado da spec §5, prazos por parâmetro)
export async function contarParados(db: ClienteDb): Promise<number>;
export async function tarefaParados(db: ClienteDb): Promise<number>;            // cria followups 'parado' pendentes; devolve quantos
export async function tarefaPagamentoPendente(db: ClienteDb): Promise<number>; // Aguardando pagamento → Cadastrado + followup 'parado'
```
  - Predicado de `SQL_PARADOS`: `atendente_id is not null and not opt_out and not sem_atendimento`; sem follow-up aberto de qualquer tipo; e (a) etapa em (`Em atendimento`, `Link enviado`, `Cadastrado`) com `ultima_msg_equipe_em` não nulo, `ultima_msg_lead_em` nulo ou anterior, `ultima_msg_equipe_em < now() - prazo` e (`ultimo_evento_app_em` nulo ou `< ultima_msg_equipe_em`); ou (b) `Aluno com horas` com `saldo_horas > 0`, `proxima_aula_em` nulo ou passado, `greatest(ultima_aula_em, ultimo_evento_app_em) < now() - alunoComHorasDias` (nulos tratados como `-infinity`), e silêncio: `greatest(ultima_msg_lead_em, ultima_msg_equipe_em) < now() - silencioAlunosH` ou ambos nulos; ou (c) `Aluno sem horas` com `ultima_aula_em < now() - alunoSemHorasDias` e o mesmo silêncio. `Novo lead` e `Encerrado` nunca.
  - `tarefaParados`: para cada linha, `insert followups (lead_id, agendado_para = now(), tipo 'parado', motivo = OBJETIVOS[etapa], status 'pendente') where not exists (aberto)` + evento `followup_created` (agente `'parado'`, gatilho `'schedule'`, decisão `'parado em <etapa>'`, motivo = objetivo). Um comando por lead, ou um só com CTE.
  - `tarefaPagamentoPendente`: leads em `Aguardando pagamento` com `pagamento_pendente_desde < now() - pagamentoPendenteH` → `etiqueta 'Cadastrado'`, `pagamento_pendente_desde = null`, evento `payment_pending_expired` (`stage_changed` com decisão `'Aguardando pagamento -> Cadastrado'`, motivo `'pagamento pendente há mais de 24 h tratado como cancelado'`) e follow-up `parado` com `motivo = OBJETIVOS.pagamento_cancelado` (se não houver aberto). `PAID` que chegue depois leva a `Aluno com horas` pela Task 4.

- [ ] **Step 1: Testes que falham** — `parado.test.ts`: `prazosDe({})` = padrão; `prazosDe({em_atendimento_h: 48})` só muda esse; `schemaPrazos` rejeita 0 e não inteiro. `parado.db.test.ts`: lead `Em atendimento` com equipe há 25 h e lead calado → 1 follow-up `parado` com `motivo 'retomar o interesse'`; mesmo lead com evento do app depois da equipe → não; lead que mandou a última mensagem → não; `Link enviado` há 23 h → não; `Aluno com horas` saldo 2, sem aula futura, última aula há 8 dias, sem mensagem 72 h → sim; com `proxima_aula_em` futura → não; saldo null → não; `Aluno sem horas` última aula há 16 dias → `'recompra de horas'`; `Novo lead` 3 dias sem resposta → não; rodar duas vezes não duplica; `tarefaPagamentoPendente`: pendente há 25 h → `Cadastrado`, follow-up `parado` com objetivo de compra, 1 `stage_changed`; pendente há 23 h → nada.
- [ ] **Step 2: Rodar** `bun test src/server/motor/parado.test.ts` e `NOME=wakecrm-teste-pf5 PORTA=54415 bash scripts/banco-teste.sh && PORTA=54415 bun run test:db src/server/motor/parado.db.test.ts` — FAIL.
- [ ] **Step 3: Implementar** (cabeçalho explicando que substitui o `reengajar` do qualificador, spec §13).
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat(motor): sinal parado por etapa e pagamento pendente cancelado em 24 h`

---

### Task 9: Ritmo, expiração e envio com prioridade, cota de envios e reconferência

**Files:**
- Modify: `src/server/motor/ritmo.ts`, `src/server/motor/ritmo.test.ts`, `src/server/motor/ritmo.db.test.ts`
- Modify: `src/server/motor/envio-followups.ts`, `src/server/motor/envio-followups.db.test.ts`
- Modify: `src/server/admin-ia.ts` (`RitmoAdmin`), `src/features/admin/Ritmo.tsx` (rótulo "enviados hoje")

**Resources:** banco pf1 / 54411. **Depends-on:** T1, T7a.

**Interfaces:**
- Consumes: `avaliarPorteiro` (T7a); `valorEsperado` (T2); `followups.expira_em/reconferido_em/aula_em` (T1).
- Produces em `ritmo.ts`: `MODOS` inalterado, agora com significado "envios por dia" (comentário); `export async function enviadosHoje(db: ClienteDb): Promise<number>` (`status = 'enviado'` com `enviado_em` no dia SP) substitui `preparadosHoje`; `expiradoPorHorario` removido (e seu teste); `tarefaExpirarFollowups(db, agora?)`: `aguardando_aprovacao and expira_em <= $agora` → `expirado` (mesmos eventos/notificações), **e** lembretes abertos (`pendente`/`aguardando_aprovacao`/`aprovado`) com `aula_em < $agora` → `cancelado` motivo `'aula já passou'` com `followup_cancelled`.
- Produces em `envio-followups.ts`:
  - `export type Candidato = { id: string; tipo: string; aprovadoEm: Date; valorEsperado: number }`; `export function ordenarFila(c: Candidato[]): Candidato[]` — lembretes primeiro, depois `valorEsperado` desc, depois `aprovadoEm` asc.
  - `export async function listarCandidatos(db: ClienteDb): Promise<(Candidato & { reconferir: boolean })[]>` — `aprovado` com `aprovado_por`, lead sem opt-out/sem_atendimento; `reconferir = aprovado_em < now() - 3 dias and (reconferido_em is null or reconferido_em < now() - 3 dias)`; valor esperado calculado em TS com `preco_hora`.
  - `tarefaEnvioFollowups(deps: { adaptador: AdaptadorEvolution; ia?: ClienteIa; agora?: () => Date }): Promise<number>` — ordem: órfãos → janela → `enviadosHoje() >= MODOS[modo].cotaDia` ⇒ 0 → intervalo → fila atrasada → `ordenarFila(listarCandidatos())`; percorre a lista: candidato com `reconferir` e sem `deps.ia` é pulado; com `ia`, `avaliarPorteiro`: barrado ⇒ `abortado` com `motivo_cancelamento = 'porteiro na fila de envio: ' + motivo`, evento `followup_blocked` (agente `'porteiro'`), aviso ao vendedor (`TITULO_AVISO` novo: `"Follow-up barrado na fila"`), segue para o próximo; liberado ⇒ `reconferido_em = now()`. Reivindica o escolhido com `update ... where id = $1 and status = 'aprovado' returning` (SKIP LOCKED continua); envio e registro como hoje.
- `admin-ia.ts`: `RitmoAdmin.preparadosHoje` → `enviadosHoje`; `Ritmo.tsx` mostra "enviados hoje: n de cota".

- [ ] **Step 1: Testes que falham** — `ritmo.test.ts`: remove o teste de `expiradoPorHorario`; `envio-followups.db.test.ts` (adaptador falso existente): `ordenarFila` puro (lembrete com valor 0 vence `parado` de valor 1000; dois `parado`: maior valor; empate: mais antigo); cota: 20 `enviado` hoje + 1 aprovado → devolve 0 e nada muda (Review Focus 4); aprovado há 4 dias sem `ia` → pulado, o seguinte sai; aprovado há 4 dias com falso que barra → `abortado` com motivo `porteiro na fila de envio: ...`, evento e notificação; com falso que libera → `reconferido_em` preenchido e enviado. `ritmo.db.test.ts`: `expira_em` ontem → `expirado`; `expira_em` amanhã (varredura) às 20h de hoje → fica; lembrete com `aula_em` passada → `cancelado 'aula já passou'`.
- [ ] **Step 2: Rodar** `bun test src/server/motor/ritmo.test.ts` e `NOME=wakecrm-teste-pf1 PORTA=54411 bash scripts/banco-teste.sh && PORTA=54411 bun run test:db src/server/motor/ritmo.db.test.ts src/server/motor/envio-followups.db.test.ts src/server/admin-ia.db.test.ts` — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS. `bun run typecheck` limpo nos arquivos tocados.
- [ ] **Step 5: Commit** — `feat(envio): cota por envios, lembretes primeiro, fila entre dias e reconferência após 3 dias`

---

### Task 10: Varredura "Buscar follow-ups agora"

**Files:**
- Create: `src/server/motor/varredura.ts`, `src/server/motor/varredura.db.test.ts`
- Create: `src/server/admin-varredura.ts`
- Create: `src/features/aprovacao/BotaoVarredura.tsx`
- Modify: `src/routes/aprovar.tsx` (header: botão para admin e `Link` para `/revisar-decisoes`)

**Resources:** banco pf2 / 54412. **Depends-on:** T7a, T8, T12 (rota `/revisar-decisoes` existe). vite: `"**/src/server/admin-varredura.ts"`.

**Interfaces:**
- Consumes: `redigir`, `ResultadoRedacao` (T7a); `tarefaParados`, `contarParados` (T8); `SQL_VENCIDOS` (redator-sql).
- Produces em `motor/varredura.ts`:
```ts
export type EstadoVarredura = { id: string; status: "rodando" | "concluida" | "falhou"; total: number; analisados: number; sugeridos: number; barrados: number; iniciadaEm: string; concluidaEm: string | null; erro: string | null };
export async function lerVarreduraAtual(db: ClienteDb): Promise<EstadoVarredura | null>; // a 'rodando' ou a última concluída nas 24 h
export async function iniciarVarredura(db: ClienteDb, ia: ClienteIa, adminId: string): Promise<{ id: string }>; // insert 'rodando' (23505 → Error("Já existe uma varredura em andamento.")), evento sweep_started (entidade config, CONFIG_ID), dispara executarVarredura sem await
export async function executarVarredura(db: ClienteDb, ia: ClienteIa, id: string): Promise<void>; // tarefaParados → ids = todos SQL_VENCIDOS → total → redigir(ids, { diasValidade: 1, aoConcluirUm: atualiza analisados/sugeridos/barrados }) → 'concluida' + sweep_finished; exceção → 'falhou' com erro (sem texto de conversa)
```
- Produces em `admin-varredura.ts`: `getVarredura = createServerFn GET` → `{ parados: number; atual: EstadoVarredura | null; iaDisponivel: boolean }` (exigirAdmin); `iniciarVarreduraAdmin = createServerFn POST` validator `z.object({ confirmo: z.literal("s") })` → `{ id }`; sem `criarClienteOpenAi()` lança `"IA indisponível: configure OPENAI_API_KEY."`.
- `BotaoVarredura.tsx`: botão "Buscar follow-ups agora" (admin) abre `Dialog` com `"<n> leads parados serão analisados. Cada análise é uma chamada paga à OpenAI."`, campo de texto com rótulo `Digite s para confirmar (s/N)`, botão habilitado só com valor `"s"`; enquanto `atual.status === "rodando"` mostra `"analisando <analisados> de <total>"` com `refetchInterval: 2000`; ao concluir mostra `"<sugeridos> viraram sugestão, <barrados> barrados"` e invalida `["aprovacao"]`. Botão desabilitado com varredura rodando ou IA indisponível (com motivo em `title`).

- [ ] **Step 1: Testes que falham** — `varredura.db.test.ts` com cliente falso: 3 leads parados → `executarVarredura` cria 3 `aguardando_aprovacao` com `expira_em` amanhã 19:59:59 SP, `varreduras` fica `concluida` com `total 3, analisados 3, sugeridos 3`; nenhum follow-up `aprovado`/`enviado` (Review Focus 4); falso barrando 1 → `barrados 1`; `iniciarVarredura` duas vezes → segunda lança; falso que lança → `status 'falhou'` com `erro`.
- [ ] **Step 2: Rodar** `NOME=wakecrm-teste-pf2 PORTA=54412 bash scripts/banco-teste.sh && PORTA=54412 bun run test:db src/server/motor/varredura.db.test.ts` — FAIL.
- [ ] **Step 3: Implementar** servidor e UI (`docs/design.md`, mobile primeiro; `Dialog` do shadcn já instalado).
- [ ] **Step 4: Rodar** — PASS; `bun run lint && bun run typecheck`.
- [ ] **Step 5: Commit** — `feat(varredura): botão Buscar follow-ups agora com confirmação, progresso e resumo`

---

### Task 11: Tela "Fila de envio" (admin)

**Files:**
- Create: `src/server/fila-envio.ts`, `src/server/fila-envio.db.test.ts`
- Create: `src/routes/fila-envio.tsx`, `src/features/fila-envio/ListaFilaEnvio.tsx`
- Modify: `src/routes/aprovar.tsx` (header admin: `Link` para `/fila-envio`)

**Resources:** banco pf1 / 54411. **Depends-on:** T9, T10. vite: `"**/src/server/fila-envio.ts"`.

**Interfaces:**
- Consumes: `listarCandidatos`, `ordenarFila` (T9); `enviadosHoje`, `lerRitmo`, `MODOS` (ritmo).
- Produces em `fila-envio.ts`:
```ts
export type ItemFila = { followupId: string; leadNome: string | null; telefone: string; vendedorNome: string | null; tipo: string; etiqueta: string; valorEsperado: number; aprovadoEm: string; posicao: number; reconferir: boolean };
export type FilaEnvio = { itens: ItemFila[]; saemHoje: number; cotaDia: number; enviadosHoje: number; previsaoDias: number };
export async function lerFilaEnvio(db: ClienteDb): Promise<FilaEnvio>; // saemHoje = min(itens, max(0, cotaDia - enviadosHoje)); previsaoDias = itens === 0 ? 0 : ceil((itens + enviadosHoje) / cotaDia)
export async function removerDaFila(db: PoolClient, adminId: string, followupId: string): Promise<void>; // aprovado → abortado 'removido da fila pelo admin' + evento followup_aborted (agente humano, origem painel); outro status → Error("Este follow-up já saiu da fila.")
export const getFilaEnvio = createServerFn GET; export const removerDaFilaEnvio = createServerFn POST validator z.object({ followupId: z.string().uuid() }); // exigirAdmin
```
- Rota `/fila-envio` (admin, `exigirAdmin` em `beforeLoad`, `head` "Fila de envio — Wake Club"): KPIs (na fila, saem hoje, previsão de esvaziar), lista ordenada com posição, lembrete marcado, botão "Remover" com confirmação (`AlertDialog`), `refetchInterval: 30_000`.

- [ ] **Step 1: Testes que falham** — 3 aprovados (1 lembrete) + 19 enviados hoje em conservador → `saemHoje 1`, `previsaoDias 2`, lembrete em `posicao 1`; `removerDaFila` em aprovado → `abortado` + evento; em `enviado` → lança.
- [ ] **Step 2: Rodar** `NOME=wakecrm-teste-pf1 PORTA=54411 bash scripts/banco-teste.sh && PORTA=54411 bun run test:db src/server/fila-envio.db.test.ts` — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS; `bun run lint && bun run typecheck`.
- [ ] **Step 5: Commit** — `feat(fila-envio): tela do admin com previsão e remoção`

---

### Task 12: Tela "Revisão das decisões" (admin)

**Files:**
- Create: `src/routes/revisar-decisoes.tsx`, `src/features/revisao/CardRevisao.tsx`

**Resources:** nenhum (UI sobre T7b). **Depends-on:** T7b.

**Interfaces:**
- Consumes: `listarDecisoesParaRevisar`, `revisarDecisao`, `DecisaoParaRevisar` (T7b).
- Produces: rota `/revisar-decisoes` (admin), seletor de período (7 / 30 dias, `validateSearch` `z.object({ dias: z.enum(["7","30"]).optional() })`), um `CardRevisao` por decisão: lead, vendedor, etiqueta, texto da IA, texto enviado/editado (diferença destacada quando difere), decisão e motivos da atendente, botões **Concordo** / **Discordo**, `Textarea` observação (máx. 500), envia e remove o card (`invalidateQueries(["revisao"])`); vazio: "Nenhuma decisão para revisar neste período".

- [ ] **Step 1:** sem teste unitário de UI no projeto; critério: `bun run lint`, `bun run typecheck`, `bun run build` passam e a rota aparece em `routeTree.gen.ts`.
- [ ] **Step 2: Implementar** seguindo `docs/design.md` e `CardAprovacao.tsx` como referência visual.
- [ ] **Step 3: Rodar** `bun run lint && bun run typecheck` — PASS.
- [ ] **Step 4: Commit** — `feat(revisao): tela Revisão das decisões para o admin`

---

### Task 13: Pipeline — colunas novas e informação do aluno nos cards

**Files:**
- Modify: `src/features/pipeline/ColunaEtapa.tsx` (`ICONES` nas oito etapas: `Sprout, Headset, Link2, UserCheck, CreditCard, GraduationCap, Hourglass, Archive`), `src/features/pipeline/CardLead.tsx`, `src/server/leads.ts`
- Modify (só após o merge do plano "visão comercial", no local em que esse plano deixar o componente): `PipelinePorEtapa.tsx` — filtro `c.etapa !== "Encerrado"`. Se o merge não tiver acontecido quando esta task rodar, ela vai para a wave 5; se ainda assim o arquivo continuar em `src/features/visao-geral/`, o coordenador aplica essa única linha.

**Resources:** nenhum. **Depends-on:** T2 e merge do plano "visão comercial". Não toca `src/routes/pipeline.tsx`.

**Interfaces:**
- Produces em `leads.ts`: `LeadPipeline` ganha `saldoHoras: number | null; proximaAulaEm: string | null; ultimaAulaEm: string | null` (extras lidos do pool do motor na mesma query de `horas_estimadas`). `CardLead` mostra, quando a etapa é `Aluno com horas`/`Aluno sem horas`: "n h restantes" (ou "saldo desconhecido"), "próxima aula <data>" / "última aula <data>" via `src/lib/formato.ts`.

- [ ] **Step 1:** `bun run typecheck` falha hoje em `ColunaEtapa.tsx` (etapas antigas) — esta é a reprodução.
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Rodar** `bun run lint && bun run typecheck && bun test src/lib` — PASS.
- [ ] **Step 4: Commit** — `feat(pipeline): colunas nas etapas novas e saldo/aulas do aluno no card`

---

### Task 14: Configurações — prazos do "parado" e horas sem saldo

**Files:**
- Create: `src/server/prazos.ts`, `src/features/configuracoes/PrazosParado.tsx`
- Modify: `src/routes/configuracoes.tsx` (uma importação e um cartão abaixo de `ModoFollowup`)
- Modify: `src/server/admin-motor.ts` (`MonitorFila.horasSemSaldo`), `src/server/admin-motor.db.test.ts`, `src/features/configuracoes/FilaEventos.tsx`

**Resources:** banco pf2 / 54412. **Depends-on:** T1, T8. vite: `"**/src/server/prazos.ts"`. Possível conflito com o plano "visão comercial" em `configuracoes.tsx` (meta de vendas): o coordenador resolve na mesma wave.

**Interfaces:**
- Consumes: `Prazos`, `schemaPrazos`, `lerPrazos`, `gravarPrazos`, `PRAZOS_PADRAO` (T8).
- Produces em `prazos.ts`: `getPrazosParado = createServerFn GET → Prazos`; `definirPrazosParado = createServerFn POST validator(schemaPrazos) → Prazos` (exigirAdmin, pool do motor, evento `config_changed` entidade `config` com `estado_anterior/novo`, como `definirRitmo`).
- Produces em `admin-motor.ts`: `MonitorFila.horasSemSaldo: { leadNome: string | null; telefone: string; ocorridoEm: string }[]` (últimas 20 de `app_eventos` com `resultado = 'hora_sem_saldo'`, join `leads`). `FilaEventos.tsx` lista "Horas sem saldo" abaixo dos contadores.
- `PrazosParado.tsx`: `Secao` "Prazos de follow-up" com sete campos numéricos (rótulos: "Em atendimento (h)", "Link enviado (h)", "Cadastrado (h)", "Aluno com horas (dias)", "Aluno sem horas (dias)", "Silêncio dos alunos (h)", "Pagamento pendente (h)"), valores iniciais de `getPrazosParado` (padrão `PRAZOS_PADRAO`), salvar com toast.

- [ ] **Step 1: Testes que falham** — `admin-motor.db.test.ts`: `app_eventos` com `hora_sem_saldo` aparece em `lerMonitorFila().horasSemSaldo` com nome do lead; `prazos` coberto pelos testes de T8 + validação Zod no server fn (`definirPrazosParado` com `cadastradoH: 0` rejeita — teste puro em `prazos.test.ts` de T8 já cobre `schemaPrazos`).
- [ ] **Step 2: Rodar** `NOME=wakecrm-teste-pf2 PORTA=54412 bash scripts/banco-teste.sh && PORTA=54412 bun run test:db src/server/admin-motor.db.test.ts` — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS; `bun run lint && bun run typecheck`.
- [ ] **Step 5: Commit** — `feat(configuracoes): prazos do sinal parado e horas sem saldo na fila de eventos`

---

### Task 15: Boot do motor, documentação e verificação final

**Files:**
- Modify: `src/server/motor/iniciar.ts`
- Modify: `docs/architecture.md` (etapas, ciclo de vida do follow-up, tabela de tarefas, modelo de dados, rotas novas, "Ritmo, cota" com envios/dia, "Fila de aprovação e avaliações" + revisões), `docs/quality.md` (se novos comandos), `docs/handoff.md` (estado, pendências)
- Modify: `vite.config.ts` já aplicado pelo coordenador (conferir as quatro entradas: `revisao.ts`, `prazos.ts`, `admin-varredura.ts`, `fila-envio.ts`)

**Resources:** banco pf1 / 54411 (suíte completa). **Depends-on:** todas.

**Interfaces:**
- Consumes: `tarefaParados`, `tarefaPagamentoPendente` (T8); `tarefaEnvioFollowups({ adaptador, ia })` (T9).
- Produces em `iniciar.ts` (`agendarIaEFollowups`): `agendar("parado", 15 * MINUTO, tarefaParados)` e `agendar("pagamento-pendente", 5 * MINUTO, tarefaPagamentoPendente)` sempre (não dependem de IA); `envio-followups` recebe `ia` quando houver chave (`criarClienteOpenAi()` movido para antes).

- [ ] **Step 1: Implementar** boot e documentação (tabela de tarefas com `parado` 15 min e `pagamento-pendente` 5 min; diagrama do ciclo de vida com `expira_em`, `reconferido_em`, lembretes; etapas novas e mapeamento; `app_eventos`, `followup_revisoes`, `varreduras`; rotas `/fila-envio`, `/revisar-decisoes`; "A etapa do lead só a IA move" vira "a etapa é movida pelo motor, pela IA (até Link enviado/Encerrado) e pelo app").
- [ ] **Step 2: Verificação** — `PROTO_BUN_VERSION=1.3.11 bun run check`; `bun run build`; `NOME=wakecrm-teste-pf1 PORTA=54411 bash scripts/banco-teste.sh && PORTA=54411 bun run test:db`; `git diff --check`; conferir que `.env`, dumps e artefatos não entraram.
Expected: tudo PASS; 0 erros de lint/tipos.
- [ ] **Step 3: Commit** — `feat(motor): tarefas parado e pagamento pendente no boot; docs do pipeline e follow-up`

---

## Self-review

- **Cobertura da spec:** §2 etapas/eventos (T1, T2, T4), saldo do comprador e 1 h por aula (T4), cota = envios/dia (T9), atendente não alimenta prompt e admin revisa (T7a, T7b, T12), botão de varredura (T10). §3 tabela e mapeamento (T1, T4, T5, T6), `USER_HOUR_BOOKED` só grava próxima aula (T4), `test` nunca move (T3, T4). §4 saldo, hora sem saldo visível (T4, T14); estorno "quando o app passar a enviar" fica fora (sem evento definido). §5 prazos configuráveis (T8, T14), pagamento pendente 24 h (T8), alunos sem exigir última da equipe + silêncio 48 h (T8), redator recebe etapa e objetivo (T7a). §6 lembretes do `BOOKED` com prioridade máxima, aprovação e cota (T4, T9); cancelamento por evento do app de cancelamento fica para quando o app enviar (nenhum evento conhecido). §7 botão, contagem, aviso de custo, `s/N`, progresso, resumo, uma por vez (T10). §8 cota de envio, fila entre dias, cancelamento por mensagem/evento (T6, T4), reconferência 3 dias (T9), expiração só de não decididos (T9), tela Fila de envio (T11). §9 dois níveis, tela, aprendizado só por revisão, admin direto = decisão + revisão (T7a, T7b, T12). §12 constraint e views (T1), webhook de vendas (T4), eventos no mesmo comando (todas). §13 parado substitui `reengajar` (T5, T8), validade da varredura (T7a, T10), venda sem `hours` (T4), idempotência (T1, T3, T4).
- **Decisões que a spec deixou ao construtor e este plano fixa:** lembretes em 10h (véspera) e 8h (dia), só com 2 h de folga; `Encerrado` não volta por evento do app (nem por PAID) — revisável pelo dono; IA só move entre `Novo lead`, `Em atendimento`, `Link enviado`, `Encerrado`; reconferência sem IA disponível pula o item em vez de enviar; aprovado barrado na reconferência avisa o vendedor por notificação; revisões no prompt são as 10 mais recentes da equipe inteira.
- **Tipos entre tasks:** `Etapa`/`proximaEtapa`/`etiquetaDaIa` (T2) usados em T4, T5; `EventoApp` (T3) em T4; `redigir`/`avaliarPorteiro`/`ResultadoRedacao` (T7a) em T9, T10; `tarefaParados`/`contarParados`/`Prazos` (T8) em T10, T14, T15; `listarCandidatos`/`ordenarFila`/`enviadosHoje` (T9) em T11; `DecisaoParaRevisar` (T7b) em T12 — nomes conferidos.
- **Review Focus:** cada linha tem teste nomeado em T4, T6, T7a/T7b, T9, T10.
- **Proporção:** o plano traz assinaturas, nomes de testes e valores; nenhum corpo de função além do que a assinatura e os testes não determinam.

## Rulings do coordenador (05/11/2026)

- **Encerrado e compra paga:** `USER_HOUR_PURCHASE_PAID` (não teste) move o lead de **qualquer** etapa, inclusive Encerrado, para Aluno com horas (exceção à regra "só avançam" do §3 do spec: quem pagou é aluno). Opt-out continua bloqueando follow-up, mas não a etapa. Ajustar o teste de T4 de acordo.
- **Chamada dupla à IA** (redator automático e varredura no mesmo lead): aceita; o índice de follow-up aberto impede escrita dupla, o custo extra é raro.
- **`src/routes/configuracoes.tsx`:** T14 depende do merge do plano da visão comercial (T5 mexe no mesmo arquivo). Se ainda não estiver mesclado quando a onda de T14 chegar, T14 espera.
