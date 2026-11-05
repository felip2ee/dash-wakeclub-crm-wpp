# WakeCRM · Visão geral comercial · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a Visão geral responde "o comercial está indo bem?": vendas contra a meta diária,
leads novos, de onde vieram (anúncio, link, busca, outro, direto) e quanto da coorte virou
venda; o pipeline em reais e os gráficos por etapa passam para a aba Pipeline.

**Architecture:** a origem do lead nasce no adaptador da Evolution (`contextInfo` da primeira
mensagem vira `EventoMensagem.origem`), é gravada pela ingestão nas colunas novas de
`wakeclub.leads` (a primeira origem vale) e preenchida para o passado por um script manual
que lê o banco `evolution` só em leitura. Um módulo novo `src/server/comercial.ts` agrega,
pelo pool do motor e em SQL de São Paulo, vendas × meta, leads novos por coorte (primeira
mensagem do lead), conversão, origem e atendimento, e `getVisaoGeral` passa a devolvê-lo. A
meta diária mora em `configuracoes.meta_vendas_dia`, editável em Configurações.

**Tech Stack:** TanStack Start + React 19 + Nitro, TanStack Query, Tailwind v4 + shadcn/ui,
PostgreSQL 14 via `pg` (sem ORM), Zod, `bun:test`, Bun `PROTO_BUN_VERSION=1.3.11`, Postgres
de teste em Docker (`scripts/banco-teste.sh`).

**Spec:** `docs/superpowers/specs/2026-11-05-wakecrm-visao-comercial-design.md` (§4
objetivos, §7 restrições, §8 decisões do construtor, que são vinculantes).

## Global Constraints

- Português do Brasil em tela, comentário, coluna e doc; fuso `America/Sao_Paulo` para dias e meses (spec §7).
- Postgres 14; migração nova numerada **`0007_origem_e_meta.sql`** (o plano paralelo de pipeline usa 0008+); casts explícitos (`$1::uuid`, `$1::date`); só `src/server/db.ts` importa `pg` em `src/` (scripts em `scripts/` podem, como `migrar.mjs`).
- Leitura pelo pool do motor (`getPoolMotor()`), no padrão de `visao-geral.ts`/`dinheiro.ts`; `snake_case` → `camelCase` no servidor; `numeric` com `Number(...)`; datas ISO.
- Visão geral continua **só admin** (`exigirAdmin`); nenhum número novo é exposto ao atendente (spec §6).
- Mapeamento de origem (spec §4.1): `anuncio` ← `ctwa_ad` ou `externalAdReply.sourceType === 'ad'`; `link` ← `click_to_chat_link`, `phone_number_hyperlink`, `message_short_link`; `busca` ← `global_search_new_chat`; `outro` ← qualquer outra marca não vazia; sem marca → `direto` (nunca chute). `leads.origem` (texto livre) não muda.
- A primeira origem vale: nunca sobrescrever colunas `origem_*` já preenchidas (spec §4.1, §5).
- Lead novo = `min(mensagens.enviada_em) where direcao = 'lead'` no período; `leads.criado_em` não é usado (spec §8).
- Meta = `meta_vendas_dia` × dias corridos do período (inclui hoje); projeção = vendas ÷ dias decorridos × dias do mês, só no mês corrente (spec §8).
- Comparação com o período anterior de mesmo tamanho para vendas, faturamento, leads novos e atendimento; **não** para conversão por coorte (spec §8).
- Filtro por vendedor: coorte por `leads.atendente_id`; vendas por `vendas.vendedor_id` (spec §8). Venda sem lead conta em "Vendas", não na conversão (spec §7).
- `bun run db:origem` é manual, só leitura no banco `evolution`, escreve só as colunas `origem_*` de `wakeclub.leads`, idempotente; não entra no instalador (spec §8).
- Não mover etapas nem depender de nome de etiqueta além de ler (`plan paralelo`); não calcular CPL/ROAS (spec §5).
- Sem dependência nova. Novo módulo com `createServerFn` entra em `importProtection.client.excludeFiles` (este plano não cria nenhum: o server fn fica em `visao-geral.ts`, já excluído).
- Commits por tarefa em Conventional Commits em português; o controlador commita. Título do PR: `feat(visao-geral): visão comercial com origem do lead e meta (com migração)`.
- Checagens: `PROTO_BUN_VERSION=1.3.11 bun run check`; `PROTO_BUN_VERSION=1.3.11 bun run build`; banco com `NOME=wakecrm-teste-vc<N> PORTA=5440<N> bash scripts/banco-teste.sh && PROTO_BUN_VERSION=1.3.11 PORTA=5440<N> bun run test:db <arquivo>`. Nunca o `wakecrm-teste` padrão (54339).

## Decisões deste plano (construtor, spec §9)

- **Leitura do banco da Evolution** no `db:origem`: `ADMIN_DATABASE_URL` com o caminho trocado para `/evolution`, conexão com `-c default_transaction_read_only=on`; instância pelo `EVOLUTION_INSTANCIA` (padrão `wakeclub`). O script roda com **Bun** e reaproveita `normalizarEvolution` embrulhando cada linha de `"Message"` num envelope `messages.upsert`: zero lógica duplicada de JID, 9º dígito ou origem.
- **Quando o motor decide a origem:** na primeira mensagem **do lead** (`direcao = 'lead'`): com marca → canal mapeado; sem marca → `direto`. Mensagem da equipe nunca preenche. `origem_detectada_em` só quando houve marca (`direto` fica com `null`). Lead antigo sem marca no retroativo → `direto`.
- **Sem índice novo.** `mensagens_lead_recentes_idx (lead_id, enviada_em desc)` serve o `min` por lead; `vendas_lead_idx` e `vendas_vendedor_idx` servem o recorte. Volume atual (< 10 mil mensagens) não justifica mais (spec §9).
- **`ResumoDinheiro` fica como está** (Pipeline e Vendas o usam); `getVisaoGeral` deixa de chamar `getPipeline` e passa a devolver `comercial`. `rankingPeriodo` e `comissaoAPagarDia10` continuam vindo de `lerResumoDinheiro`.
- **Blocos que mudam de aba:** `Kpis` (Pipeline cheio / Estimativa realista / Vendido / Comissão) já está em `/pipeline`; `PipelinePorEtapa` passa para lá. `/vendas` ganha a seção "Resumo do período" com Vendido no período, Comissão a pagar dia 10 e `VendasPorCategoria`. **`VendasRecentes.tsx` é apagado**: em `/vendas` a lista completa do período (`ListaVendas`) já mostra as mesmas vendas; repetir dez delas acima seria duplicar. Desvio do texto literal da §8 ("Vendas recentes vão para Vendas"), registrado para o dono.
- **Atalhos de período** (hoje / 7 dias / mês / personalizado) entram em `FiltroPeriodo`, que `/vendas` também usa; o atalho ativo é derivado das datas.
- **Meta** é inteiro de 1 a 1000 (`z.number().int()`); fração de venda por dia não foi pedida.
- `scripts/migrar.db.test.ts` hoje espera as pendentes `0003..0005` e já está defasado (a 0006 existe); a Task 1 corrige para `0003..0007`. O plano paralelo (0008+) vai tocar a mesma linha: colisão conhecida, resolvida pelo controlador no merge.

## Review Focus

1. Conversa iniciada pela equipe e lead responde depois com marca de anúncio → origem vira `anuncio` (não fica `null` nem `direto`) e o lead conta como novo na data da resposta (Task 3 `equipe inicia, lead responde com marca`; Task 6 `lead sem mensagem recebida não é novo`).
2. Venda ligada a lead que nunca mandou mensagem (criado pela equipe ou importado) → conta em "Vendas" e em "Clientes existentes", nunca na conversão (Task 6 `venda de lead sem mensagem recebida vai para existentes`).
3. Mensagem às 23:30 de São Paulo do último dia do período (02:30 UTC do dia seguinte) → entra no período; venda nas mesmas condições idem (Task 6 `limite do período em São Paulo`).
4. `db:origem` rodado duas vezes, com `@lid`, com número de 12 dígitos e com mensagem `fromMe` marcada → segunda rodada não muda nada, `@lid` resolve por `remoteJidAlt`, 12 dígitos casa com o lead de 13, `fromMe` é ignorado (Task 4 `idempotente`, `lid e 12 digitos`, `fromMe ignorado`).
5. Período personalizado de N dias → período anterior é exatamente os N dias imediatamente antes de `de`, sem sobreposição; 7 dias = hoje e os 6 anteriores (Task 6 `periodoAnterior`; Task 7 `ultimos7Dias`).

---

## Ondas (paralelismo, `.claude/rules/parallel-subagent-driven-development.md`)

| Onda | Tarefas | Observação |
|---|---|---|
| 1 | T1, T2, T7, T9 | arquivos disjuntos; só T1 usa banco (vc1) |
| 2 | T3, T4, T5, T6 | todas dependem de T1 (migração no working tree); T3 e T4 dependem de T2; bancos vc3, vc4, vc5, vc6 |
| 3 | T8 | depende de T6 e T7 |
| 4 | T10 | docs e checagem final (vc10) |

---

### Task 1: Migração 0007 (origem do lead e meta de vendas)

**Files:**
- Create: `db/migrations/0007_origem_e_meta.sql`
- Create: `src/server/motor/migracoes-0007.db.test.ts`
- Modify: `scripts/migrar.db.test.ts:62-66`

**Resources:** contêiner `wakecrm-teste-vc1`, porta 54401. **Depends-on:** none.

**Interfaces:**
- Produces: colunas em `wakeclub.leads`: `origem_canal text` (check in `anuncio, link, busca, outro, direto`), `origem_app text` (check in `instagram, facebook, whatsapp`), `origem_anuncio_id text`, `origem_anuncio_titulo text`, `origem_detectada_em timestamptz`; linha `configuracoes ('meta_vendas_dia', '2')` com `on conflict (chave) do nothing`. Grants: nenhum novo (0002 já dá DML em `leads` à `wakecrm_motor`; 0004 já dá `select, update` em `configuracoes` à `painel_rw` e `select` à `painel_ro`).

- [ ] **Step 1: Teste de banco falhando**

```ts
// src/server/motor/migracoes-0007.db.test.ts
describe.skipIf(!bancoTesteAtivo)("migração 0007", () => {
  test("colunas de origem aceitam só os canais e apps da spec", ...)   // insert origem_canal 'xyz' → code 23514; 'anuncio' + app 'instagram' → rowCount 1; app 'tiktok' → 23514
  test("meta_vendas_dia nasce 2 como número jsonb", ...)               // select valor #>> '{}' = '2' e jsonb_typeof = 'number'
  test("painel_rw lê e atualiza meta_vendas_dia; painel_ro só lê", ...) // getPoolRw update → rowCount 1; getPool update → code 25006 (conexão read-only)
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `NOME=wakecrm-teste-vc1 PORTA=54401 bash scripts/banco-teste.sh && PROTO_BUN_VERSION=1.3.11 PORTA=54401 bun run test:db src/server/motor/migracoes-0007.db.test.ts`
Expected: FAIL (`column "origem_canal" does not exist`).

- [ ] **Step 3: Escrever a migração**

Cabeçalho no padrão da 0005 (por quê, spec, idempotência). `alter table leads add column if not exists ...` ×5; constraints `leads_origem_canal_valida` e `leads_origem_app_valida` guardadas por `if not exists` em `pg_constraint` (padrão da 0004); `insert into configuracoes ... on conflict (chave) do nothing`. Sem bloco de grants: comentar que os da 0002/0004 cobrem.

- [ ] **Step 4: Atualizar `scripts/migrar.db.test.ts`** para esperar `["0003_virada.sql", "0004_ia_followup.sql", "0005_vendas.sql", "0006_webhook_sem_apikey.sql", "0007_origem_e_meta.sql"]`.

- [ ] **Step 5: Rodar e ver passar**

Run: `NOME=wakecrm-teste-vc1 PORTA=54401 bash scripts/banco-teste.sh && PROTO_BUN_VERSION=1.3.11 PORTA=54401 bun run test:db src/server/motor/migracoes-0007.db.test.ts scripts/migrar.db.test.ts`
Expected: PASS; reaplicar `0007` por cima (`docker exec -i wakecrm-teste-vc1 psql ... -f -`) não falha.

- [ ] **Step 6: Commit** — `feat(db): migração 0007 com origem do lead e meta de vendas`

### Task 2: Origem da conversa no adaptador da Evolution

**Files:**
- Create: `src/server/evolution/origem.ts`, `src/server/evolution/origem.test.ts`
- Create fixtures sintéticas em `src/server/evolution/fixtures/`: `origem-anuncio-instagram.json` (extendedTextMessage com `contextInfo.entryPointConversionSource: "ctwa_ad"`, `entryPointConversionApp: "instagram"`, `externalAdReply { title: "Aula experimental de wake", sourceId: "120210000000000001", sourceType: "ad", sourceUrl, ctwaClid }`, repetido em `data.contextInfo`), `origem-anuncio-so-external.json` (só `externalAdReply.sourceType: "ad"`, sem source), `origem-link.json` (`click_to_chat_link`, app vazio, em `data.contextInfo`), `origem-busca.json` (`global_search_new_chat` / `whatsapp`, em `message.messageContextInfo`), `origem-grupo.json` (`group_member_list`)
- Modify: `src/server/evolution/tipos.ts:19-29`, `src/server/evolution/normalizar.ts:127-145`, `src/server/evolution/normalizar.test.ts`

**Resources:** none. **Depends-on:** none.

**Interfaces:**
- Produces, em `tipos.ts`:
  ```ts
  export type OrigemCanal = "anuncio" | "link" | "busca" | "outro";
  export type OrigemApp = "instagram" | "facebook" | "whatsapp";
  export type OrigemLead = { canal: OrigemCanal; app: OrigemApp | null; anuncioId: string | null; anuncioTitulo: string | null };
  // EventoMensagem ganha: origem?: OrigemLead | null  (opcional: os testes que montam EventoMensagem não mudam)
  ```
- Produces, em `origem.ts`: `export function origemDoContexto(ctx: Obj): OrigemLead | null` (um `contextInfo`; `null` sem marca).
- Produces, em `normalizar.ts`: `normalizarMensagem` preenche `origem` olhando, nesta ordem, `d.contextInfo`, o `contextInfo` do conteúdo desembrulhado (`extendedTextMessage`, `imageMessage`…, qualquer chave de `message` cujo valor tenha `contextInfo`) e `message.messageContextInfo`; o primeiro não nulo vale.

- [ ] **Step 1: Testes falhando**

```ts
// origem.test.ts
test.each([
  [{ entryPointConversionSource: "ctwa_ad", entryPointConversionApp: "instagram", externalAdReply: { title: "T", sourceId: "1", sourceType: "ad" } }, { canal: "anuncio", app: "instagram", anuncioId: "1", anuncioTitulo: "T" }],
  [{ externalAdReply: { sourceType: "ad", sourceId: "2" } }, { canal: "anuncio", app: null, anuncioId: "2", anuncioTitulo: null }],
  [{ entryPointConversionSource: "click_to_chat_link", entryPointConversionApp: "" }, { canal: "link", app: null, anuncioId: null, anuncioTitulo: null }],
  [{ entryPointConversionSource: "phone_number_hyperlink" }, { canal: "link", ... }],
  [{ entryPointConversionSource: "message_short_link" }, { canal: "link", ... }],
  [{ entryPointConversionSource: "global_search_new_chat", entryPointConversionApp: "WhatsApp" }, { canal: "busca", app: "whatsapp", ... }],
  [{ entryPointConversionSource: "group_member_list" }, { canal: "outro", ... }],
  [{ entryPointConversionSource: "marca_desconhecida", entryPointConversionApp: "tiktok" }, { canal: "outro", app: null, ... }],
  [{ externalAdReply: { sourceType: "post", sourceId: "3" } }, null],   // post não é anúncio
  [{ deviceListMetadataVersion: 2 }, null],
  [{}, null],
])("mapeia %j", (ctx, esperado) => expect(origemDoContexto(ctx)).toEqual(esperado));
// normalizar.test.ts (novo describe "origem")
test("texto-recebido sem marca → origem null");
test.each([["origem-anuncio-instagram", {...}], ["origem-anuncio-so-external", {...}], ["origem-link", {...}], ["origem-busca", {...}], ["origem-grupo", {...}]])("%s", ...);
```

- [ ] **Step 2: Rodar** `PROTO_BUN_VERSION=1.3.11 bun test src/server/evolution` → FAIL (`origemDoContexto` não existe).
- [ ] **Step 3: Implementar** `origem.ts` (tabela `Record<string, OrigemCanal>` para as fontes conhecidas; app só quando `toLowerCase()` ∈ {instagram, facebook, whatsapp}; `anuncioId = str(externalAdReply.sourceId) || null`, título idem) e a coleta em `normalizarMensagem`. `desembrulhar` continua privado; a coleta roda em `normalizar.ts`.
- [ ] **Step 4: Rodar** `PROTO_BUN_VERSION=1.3.11 bun test src/server/evolution` → PASS; `bun run lint` sem aviso novo.
- [ ] **Step 5: Commit** — `feat(evolution): origem da conversa no evento normalizado`

### Task 3: Ingestão grava a origem na primeira mensagem do lead

**Files:**
- Modify: `src/server/motor/ingestao.ts:23-33` (`upsertLead`)
- Modify: `src/server/motor/ingestao.db.test.ts` (novo `describe("origem do lead")`)

**Resources:** contêiner `wakecrm-teste-vc3`, porta 54403. **Depends-on:** T1, T2.

**Interfaces:**
- Consumes: `EventoMensagem.origem?: OrigemLead | null` (T2); colunas `origem_*` (T1).
- Produces: `upsertLead(db, m)` mantém a assinatura `Promise<string>`; o `insert ... on conflict (telefone) do update` passa a gravar as cinco colunas **só quando `not m.daEquipe` e `leads.origem_canal is null`** (`case when wakeclub.leads.origem_canal is null then excluded.x else wakeclub.leads.x end` nas cinco); mensagem do lead sem marca grava `'direto'` com `origem_detectada_em = null`; com marca grava canal/app/id/título e `origem_detectada_em = m.enviadaEm`.

- [ ] **Step 1: Testes falhando**

```ts
test("primeira mensagem do lead com anúncio preenche origem e detectada_em", ...);   // esperado: canal anuncio, app instagram, id, titulo, detectada_em = enviadaEm
test("marca posterior não sobrescreve a primeira", ...);                              // 2ª msg com link → continua anuncio
test("lead sem marca é direto, sem detectada_em", ...);                               // canal 'direto', detectada_em null
test("equipe inicia, lead responde com marca", ...);                                  // após msg daEquipe: canal null; após resposta com marca: anuncio (Review Focus 1)
test("mensagem da equipe nunca preenche origem", ...);                                // daEquipe com origem no evento → canal null
```

- [ ] **Step 2: Rodar** `NOME=wakecrm-teste-vc3 PORTA=54403 bash scripts/banco-teste.sh && PROTO_BUN_VERSION=1.3.11 PORTA=54403 bun run test:db src/server/motor/ingestao.db.test.ts` → FAIL.
- [ ] **Step 3: Implementar** o upsert; parâmetros `$3..$7` com casts `::text`/`::timestamptz`; quando `m.daEquipe`, passar `null` nos cinco e canal `null` (não `'direto'`).
- [ ] **Step 4: Rodar** o mesmo comando → PASS (suíte inteira do arquivo, para garantir que o resto da ingestão não mudou).
- [ ] **Step 5: Commit** — `feat(motor): grava a origem do lead na primeira mensagem`

### Task 4: Script `db:origem` (preenchimento retroativo)

**Files:**
- Create: `scripts/origem-leads.mjs`, `scripts/origem-leads.db.test.ts`
- Modify: `package.json` (`"db:origem": "bun scripts/origem-leads.mjs"`)

**Resources:** contêiner `wakecrm-teste-vc4`, porta 54404 (o teste cria o banco `evolution` dentro dele). **Depends-on:** T1, T2.

**Interfaces:**
- Consumes: `normalizarEvolution(corpo)` de `src/server/evolution/normalizar.ts` (importado pelo Bun direto do `.ts`), colunas `origem_*`.
- Produces: comando `bun run db:origem`. Lê `ADMIN_DATABASE_URL` (e `.env`, com o `carregarEnv` copiado de `migrar.mjs`) e `EVOLUTION_INSTANCIA` (padrão `wakeclub`). Saída em linhas `canal<TAB>quantidade` (anuncio, link, busca, outro, direto), mais `sem lead no CRM<TAB>n` e `já tinham origem<TAB>n`. Exit 1 sem `ADMIN_DATABASE_URL`.
- Algoritmo fixado: (1) no banco `evolution` (URL do admin com `pathname = "/evolution"`, `options: "-c default_transaction_read_only=on"`): `select m.key, m.message, m."contextInfo", m."messageTimestamp", m."pushName" from "Message" m join "Instance" i on i.id = m."instanceId" where i.name = $1::text and coalesce(m.key->>'fromMe', 'false') <> 'true' and (m."contextInfo" ? 'entryPointConversionSource' or m."contextInfo" ? 'externalAdReply' or jsonb_path_exists(m.message, '$.**.entryPointConversionSource') or jsonb_path_exists(m.message, '$.**.externalAdReply')) order by m."messageTimestamp"`; (2) cada linha vira `normalizarEvolution({ event: "messages.upsert", instance: $1, data: linha })`; primeiro `tipo === "mensagem"` com `origem` por telefone vence; (3) em `wakeclub`, uma transação: `update wakeclub.leads set origem_canal=$2, origem_app=$3, origem_anuncio_id=$4, origem_anuncio_titulo=$5, origem_detectada_em=$6 where telefone=$1::text and origem_canal is null` por telefone, depois `update wakeclub.leads set origem_canal = 'direto' where origem_canal is null`.

- [ ] **Step 1: Teste falhando** (`scripts/origem-leads.db.test.ts`, `describe.skipIf(process.env.TESTE_BANCO !== "1")`)

Preparação: `create database evolution` se não existir (URL do admin em `/postgres`, como em `migrar.db.test.ts`); nela `create table if not exists "Instance" (id text primary key, name text)` e `"Message" (id text primary key, key jsonb, message jsonb, "contextInfo" jsonb, "messageTimestamp" integer, "instanceId" text, "pushName" text)`; `insert` da instância `wakeclub`. Leads inseridos direto (`insert into wakeclub.leads (telefone)`, pool do motor), telefones de `telefoneUnico()`. Mensagens:

```ts
// P1: ctwa_ad instagram em message.extendedTextMessage.contextInfo        → anuncio/instagram/id/titulo, detectada_em = timestamp
// P2: t=100 click_to_chat_link em contextInfo; t=200 ctwa_ad               → link (a mais antiga vence)
// P3: fromMe true com ctwa_ad                                                → direto (Review Focus 4)
// P4: lead já com origem_canal 'busca'; Evolution traz ctwa_ad               → continua busca
// P5: key.remoteJid "...@lid", remoteJidAlt com o número real, ctwa_ad       → anuncio
// P6: remoteJid com 12 dígitos (sem o 9) do lead de 13 dígitos               → anuncio
// P7: lead sem nenhuma linha na Evolution                                    → direto, detectada_em null
test("preenche pela mensagem recebida mais antiga com marca", ...);  // spawnSync("bun", ["scripts/origem-leads.mjs"], { env: { ...process.env, ADMIN_DATABASE_URL, EVOLUTION_INSTANCIA: "wakeclub" } }) status 0; stdout contém "anuncio\t3" ... ; asserts por lead
test("idempotente: segunda rodada não muda nada e reporta já tinham origem", ...);  // snapshot das 5 colunas antes/depois igual
```

- [ ] **Step 2: Rodar** `NOME=wakecrm-teste-vc4 PORTA=54404 bash scripts/banco-teste.sh && PROTO_BUN_VERSION=1.3.11 PORTA=54404 bun run test:db scripts/origem-leads.db.test.ts` → FAIL (script inexistente).
- [ ] **Step 3: Implementar** `scripts/origem-leads.mjs` (cabeçalho no padrão de `migrar.mjs`: por quê, variáveis, "só leitura na Evolution, escreve só `origem_*`") e o script em `package.json`.
- [ ] **Step 4: Rodar** → PASS. `PROTO_BUN_VERSION=1.3.11 bun run lint` passa (o `.mjs` em `scripts/` pode importar `pg`).
- [ ] **Step 5: Commit** — `feat(db): script db:origem preenche a origem dos leads pelo banco da Evolution`

### Task 5: Meta de vendas configurável

**Files:**
- Modify: `src/server/configuracoes.ts:16-59`, `src/server/configuracoes.db.test.ts`
- Create: `src/features/configuracoes/MetaVendas.tsx`
- Modify: `src/routes/configuracoes.tsx:88-93` (grid) e `:146-152` (lista do celular)

**Resources:** contêiner `wakecrm-teste-vc5`, porta 54405. **Depends-on:** T1.

**Interfaces:**
- Produces, em `configuracoes.ts`: `export type Configuracoes = { precoHora: number; metaVendasDia: number }`; `lerConfiguracoes(db): Promise<Configuracoes>` lê as duas chaves (`where chave in ('preco_hora','meta_vendas_dia')`, `Number(... ?? 0)`); `export async function gravarMetaVendasDia(db: ClienteDb, valor: number): Promise<void>` (update; `rowCount !== 1` → `Error("Configuração da meta de vendas não encontrada.")`); `export const definirMetaVendasDia` (`createServerFn POST`, `z.object({ valor: z.number().int().min(1, "A meta precisa ser de pelo menos 1 venda por dia.").max(1000) })`, `exigirAdmin`, devolve `Configuracoes`).
- Consumidores de `lerConfiguracoes`: `PrecoHora.tsx` e `configuracoes.tsx` (só leem `precoHora`, continuam válidos); T6 passa a ler `metaVendasDia`.

- [ ] **Step 1: Teste falhando** (`configuracoes.db.test.ts`)

```ts
test("lê a meta padrão 2 e grava um inteiro pela painel_rw", async () => {
  expect((await lerConfiguracoes(db())).metaVendasDia).toBe(2);
  await gravarMetaVendasDia(db(), 3);
  expect((await lerConfiguracoes(db())).metaVendasDia).toBe(3);
  // jsonb_typeof(valor) = 'number' para meta_vendas_dia
  await gravarMetaVendasDia(db(), 2);
});
```

- [ ] **Step 2: Rodar** `NOME=wakecrm-teste-vc5 PORTA=54405 bash scripts/banco-teste.sh && PROTO_BUN_VERSION=1.3.11 PORTA=54405 bun run test:db src/server/configuracoes.db.test.ts` → FAIL.
- [ ] **Step 3: Implementar** servidor; depois `MetaVendas.tsx` espelhando `PrecoHora.tsx` (`Secao id="meta-vendas"`, ícone `Target`, título "Meta de vendas", subtítulo "Vendas por dia que a equipe deve fechar; base do bloco Vendas × meta da Visão geral.", valor `plural(n, "venda por dia", "vendas por dia")`, `inputMode="numeric"`, toast "Meta agora é N vendas por dia."). Em `configuracoes.tsx`: cartão ao lado de `PrecoHora` no grid e item `{ id: "meta-vendas", titulo: "Meta de vendas", icone: Target, resumo: config.data ? plural(...) : "…" }` na lista do celular.
- [ ] **Step 4: Rodar** o teste de banco → PASS; `PROTO_BUN_VERSION=1.3.11 bun run check` → PASS.
- [ ] **Step 5: Commit** — `feat(configuracoes): meta de vendas por dia`

### Task 6: Servidor do resumo comercial

**Files:**
- Create: `src/server/comercial.ts`, `src/server/comercial.test.ts`, `src/server/comercial.db.test.ts`
- Modify: `src/server/visao-geral.ts:56-80` (handler adiciona `comercial`; mantém `pipeline` e `vendas` até a T8)

**Resources:** contêiner `wakecrm-teste-vc6`, porta 54406. **Depends-on:** T1 (as colunas; o teste grava `origem_*` por SQL, sem depender da T3).

**Interfaces:**
- Consumes: `Periodo` de `dinheiro.ts`; a meta lida direto no SQL deste módulo (`select valor #>> '{}' from wakeclub.configuracoes where chave = 'meta_vendas_dia'`, linha criada pela 0007) para não depender da T5 na mesma onda; `mesCorrente`, `diaSP` de `@/features/dinheiro/periodo` (módulo puro).
- Produces:
  ```ts
  export type Comparado = { atual: number; anterior: number };
  export type OrigemLinha = { canal: "anuncio" | "link" | "busca" | "outro" | "direto"; app: "instagram" | "facebook" | "whatsapp" | null; leadsNovos: number; compraram: number; conversaoPct: number; faturamento: number };
  export type AnuncioLinha = { anuncioId: string | null; titulo: string | null; leadsNovos: number; compraram: number; conversaoPct: number; faturamento: number };
  export type ResumoComercial = {
    periodo: { de: string; ate: string; dias: number; anterior: Periodo };
    meta: { porDia: number; periodo: number; atingidoPct: number; mesCorrente: boolean; diasDecorridos: number; projecaoMes: number | null };
    vendas: { quantidade: Comparado; faturamento: Comparado };
    leadsNovos: Comparado;
    coorte: { compraram: number; conversaoPct: number; faturamento: number };
    clientesExistentes: { quantidade: number; faturamento: number };
    porOrigem: OrigemLinha[];      // sempre os 5 canais na ordem anuncio, link, busca, outro, direto; anuncio desdobrado por app quando houver lead (senão uma linha app null)
    anuncios: AnuncioLinha[];      // só canal anuncio, ordem leadsNovos desc, titulo, anuncioId
    atendimento: { medianaPrimeiraRespostaMin: { atual: number | null; anterior: number | null }; semResposta: number };
  };
  export function diasDoPeriodo(p: Periodo): number;                         // dias corridos inclusivos, aritmética em Date.UTC
  export function periodoAnterior(p: Periodo): Periodo;                      // mesmo tamanho, termina no dia anterior a `de`
  export function resumoMeta(a: { periodo: Periodo; metaDia: number; vendas: number; agora: Date }): ResumoComercial["meta"];
  export async function lerComercial(db: ClienteDb, periodo: Periodo, vendedorId: string | null, agora = new Date()): Promise<ResumoComercial>;
  ```
- Semântica SQL fixada (fuso `'America/Sao_Paulo'`, limites como em `dinheiro.ts`: `inicio = ($de::date)::timestamp at time zone SP`, `fim = ($ate::date + 1)::timestamp at time zone SP`):
  - `primeira`: `select lead_id, min(enviada_em) as em from wakeclub.mensagens where direcao = 'lead' group by lead_id`.
  - lead novo: `primeira.em >= inicio and < fim` e (`$v is null or l.atendente_id = $v`).
  - `coorte.compraram`: leads novos com `exists (vendas paga com lead_id = l.id)` em qualquer data; `coorte.faturamento`: soma dessas vendas; `conversaoPct = round(compraram / leadsNovos × 100)` (0 quando leadsNovos = 0).
  - `vendas`: `status = 'paga'`, `comprada_em` no período, (`$v is null or vendedor_id = $v`); `anterior` com os limites de `periodoAnterior`.
  - `clientesExistentes`: vendas do período com `lead_id not null` cujo lead **não** é novo no período (inclui lead sem nenhuma linha em `primeira`).
  - `porOrigem`: leads novos agrupados por `coalesce(l.origem_canal, 'direto')` e `case when origem_canal = 'anuncio' then origem_app end`; zero-fill dos 5 canais no TS.
  - `anuncios`: leads novos com `origem_canal = 'anuncio'` agrupados por `(origem_anuncio_id, origem_anuncio_titulo)`.
  - `atendimento`: por lead novo, `resposta = min(enviada_em) from mensagens where direcao = 'equipe' and enviada_em > primeira.em`; mediana `percentile_cont(0.5) within group (order by extract(epoch from resposta - primeira.em) / 60)` → `Math.round`, `null` sem nenhum respondido; `semResposta = count(*) filter (where resposta is null)` (só o período atual).
  - `meta.porDia` = `meta_vendas_dia` (jsonb `#>> '{}'`, `Number`).

- [ ] **Step 1: Testes puros falhando** (`comercial.test.ts`)

```ts
test("diasDoPeriodo e periodoAnterior", () => {
  expect(diasDoPeriodo({ de: "2026-10-01", ate: "2026-10-31" })).toBe(31);
  expect(periodoAnterior({ de: "2026-10-01", ate: "2026-10-31" })).toEqual({ de: "2026-08-31", ate: "2026-09-30" });
  expect(periodoAnterior({ de: "2026-11-01", ate: "2026-11-05" })).toEqual({ de: "2026-10-27", ate: "2026-10-31" });  // Review Focus 5
  expect(periodoAnterior({ de: "2026-11-05", ate: "2026-11-05" })).toEqual({ de: "2026-11-04", ate: "2026-11-04" });
});
test("resumoMeta no mês corrente projeta; fora dele não", () => {
  const agora = new Date("2026-11-05T15:00:00Z");
  expect(resumoMeta({ periodo: { de: "2026-11-01", ate: "2026-11-05" }, metaDia: 2, vendas: 4, agora }))
    .toEqual({ porDia: 2, periodo: 10, atingidoPct: 40, mesCorrente: true, diasDecorridos: 5, projecaoMes: 24 });
  expect(resumoMeta({ periodo: { de: "2026-10-01", ate: "2026-10-31" }, metaDia: 2, vendas: 2, agora }))
    .toMatchObject({ periodo: 62, atingidoPct: 3, mesCorrente: false, projecaoMes: null });
  expect(resumoMeta({ periodo: { de: "2026-11-05", ate: "2026-11-05" }, metaDia: 0, vendas: 1, agora }).atingidoPct).toBe(0);
});
```

- [ ] **Step 2: Rodar** `PROTO_BUN_VERSION=1.3.11 bun test src/server/comercial.test.ts` → FAIL.
- [ ] **Step 3: Implementar** as funções puras em `comercial.ts`.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Teste de banco falhando** (`comercial.db.test.ts`; vendedor único por `criarVendedor`, leads via `registrarMensagem` + `update leads set atendente_id`, vendas via `processarVenda` com o telefone do lead; `agora = 2026-11-05T15:00Z`, período `2026-10-01..2026-10-31`, sempre filtrando por `vendedorId`)

```ts
// A: 1ª msg do lead 2026-10-05T15:00Z, origem anuncio/instagram/'ad1'/'Aula experimental' (update por SQL); equipe responde +30 min; venda paga 2026-11-02 R$ 360
// B: 1ª msg do lead 2026-10-20, origem link (SQL); sem resposta da equipe
// C: 1ª msg do lead 2026-09-15, equipe responde +60 min; venda paga 2026-10-10 R$ 500
// D: só mensagem da equipe em 2026-10-02 (daEquipe), lead nunca respondeu; venda paga 2026-10-12 R$ 200   (Review Focus 1 e 2)
// E: 1ª msg do lead 2026-11-01T02:30Z (= 31/10 23:30 em São Paulo), origem_canal não gravado (SQL não toca)  (Review Focus 3)
test("coorte, vendas, existentes, origem e atendimento do período", async () => {
  const r = await lerComercial(db(), { de: "2026-10-01", ate: "2026-10-31" }, vendedor, agora);
  expect(r.leadsNovos).toEqual({ atual: 3, anterior: 1 });                         // A, B, E; anterior (31/08–30/09): C
  expect(r.vendas).toEqual({ quantidade: { atual: 2, anterior: 0 }, faturamento: { atual: 700, anterior: 0 } });
  expect(r.coorte).toEqual({ compraram: 1, conversaoPct: 33, faturamento: 360 });
  expect(r.clientesExistentes).toEqual({ quantidade: 2, faturamento: 700 });       // C e D
  expect(r.porOrigem.map((o) => [o.canal, o.app, o.leadsNovos, o.compraram, o.conversaoPct, o.faturamento])).toEqual([
    ["anuncio", "instagram", 1, 1, 100, 360], ["link", null, 1, 0, 0, 0], ["busca", null, 0, 0, 0, 0], ["outro", null, 0, 0, 0, 0], ["direto", null, 1, 0, 0, 0]]);
  expect(r.anuncios).toEqual([{ anuncioId: "ad1", titulo: "Aula experimental", leadsNovos: 1, compraram: 1, conversaoPct: 100, faturamento: 360 }]);
  expect(r.atendimento).toEqual({ medianaPrimeiraRespostaMin: { atual: 30, anterior: 60 }, semResposta: 2 });   // B e E
  expect(r.meta).toMatchObject({ porDia: 2, periodo: 62, atingidoPct: 3, projecaoMes: null });
});
test("venda de outro vendedor para lead da coorte conta na conversão do dono do lead", ...);  // atendente = v1, venda com vendedor_id = v2 → coorte de v1 compraram 1; vendas de v1 quantidade 0
test("lead sem mensagem recebida não é novo", ...);  // D: leadsNovos não o inclui mesmo com venda no período
```

- [ ] **Step 6: Rodar** `NOME=wakecrm-teste-vc6 PORTA=54406 bash scripts/banco-teste.sh && PROTO_BUN_VERSION=1.3.11 PORTA=54406 bun run test:db src/server/comercial.db.test.ts` → FAIL.
- [ ] **Step 7: Implementar `lerComercial`** (consultas em `Promise.all` recebendo `[de, ate, vendedorId, deAnterior, ateAnterior]`) e, em `visao-geral.ts`, acrescentar `lerComercial(getPoolMotor(), data.periodo, data.vendedorId ?? null)` ao `Promise.all` e `comercial` à resposta (sem remover nada ainda).
- [ ] **Step 8: Rodar** o teste de banco → PASS; `PROTO_BUN_VERSION=1.3.11 bun run check` → PASS.
- [ ] **Step 9: Commit** — `feat(visao-geral): resumo comercial por período, coorte e origem`

### Task 7: Atalhos de período e texto de variação

**Files:**
- Modify: `src/features/dinheiro/periodo.ts`, `src/features/dinheiro/periodo.test.ts`, `src/features/dinheiro/FiltroPeriodo.tsx`
- Create: `src/features/visao-geral/variacao.ts`, `src/features/visao-geral/variacao.test.ts`

**Resources:** none. **Depends-on:** none.

**Interfaces:**
- Produces, em `periodo.ts`: `export function hoje(agora = new Date()): Periodo`; `export function ultimos7Dias(agora = new Date()): Periodo` (hoje e os 6 dias anteriores, em São Paulo); `export type Atalho = "hoje" | "7dias" | "mes" | "personalizado"`; `export function atalhoDe(p: Periodo, agora = new Date()): Atalho`.
- Produces, em `FiltroPeriodo.tsx`: mesma assinatura `({ periodo, onChange })`; ganha um `Select` (shadcn, `aria-label="Atalho de período"`) com "Hoje", "7 dias", "Mês corrente", "Personalizado"; escolher um atalho chama `onChange` com o período dele; os dois `input type="date"` só aparecem em "Personalizado" (escolher "Personalizado" mantém as datas atuais).
- Produces, em `variacao.ts`: `export function textoVariacao(atual: number, anterior: number): string` → `anterior === 0 && atual === 0` → `"igual ao período anterior"`; `anterior === 0` → `"antes: 0"`; senão `"+25% vs. período anterior"` / `"−40% vs. período anterior"` (sinal explícito, `Math.round`, 0% → `"igual ao período anterior"`).

- [ ] **Step 1: Testes falhando**

```ts
// periodo.test.ts (agora = new Date("2026-11-05T15:00:00Z"))
expect(hoje(agora)).toEqual({ de: "2026-11-05", ate: "2026-11-05" });
expect(ultimos7Dias(agora)).toEqual({ de: "2026-10-30", ate: "2026-11-05" });          // Review Focus 5
expect(ultimos7Dias(new Date("2026-11-06T01:00:00Z"))).toEqual({ de: "2026-10-30", ate: "2026-11-05" });  // 22h de SP ainda é dia 5
expect(atalhoDe({ de: "2026-11-01", ate: "2026-11-05" }, agora)).toBe("mes");
expect(atalhoDe({ de: "2026-10-01", ate: "2026-10-31" }, agora)).toBe("personalizado");
// variacao.test.ts
test.each([[5, 4, "+25% vs. período anterior"], [3, 5, "−40% vs. período anterior"], [4, 4, "igual ao período anterior"], [0, 0, "igual ao período anterior"], [3, 0, "antes: 0"]])(...)
```

- [ ] **Step 2: Rodar** `PROTO_BUN_VERSION=1.3.11 bun test src/features` → FAIL.
- [ ] **Step 3: Implementar** helpers e o `Select` em `FiltroPeriodo`.
- [ ] **Step 4: Rodar** → PASS; `PROTO_BUN_VERSION=1.3.11 bun run check` → PASS (`/vendas` e `/visao-geral` continuam compilando: a assinatura não mudou).
- [ ] **Step 5: Commit** — `feat(dinheiro): atalhos de período e texto de variação`

### Task 8: Tela da Visão geral comercial

**Files:**
- Create: `src/features/visao-geral/KpisComerciais.tsx`, `src/features/visao-geral/PorOrigem.tsx`, `src/features/visao-geral/Atendimento.tsx`
- Modify: `src/routes/visao-geral.tsx`, `src/server/visao-geral.ts:56-80` (remover `getPipeline` e `pipeline` da resposta; manter `alertas`, `vendas`, `comercial`)
- Delete: `src/features/visao-geral/VendasRecentes.tsx`

**Resources:** none. **Depends-on:** T6, T7.

**Interfaces:**
- Consumes: `ResumoComercial` (T6) via `Awaited<ReturnType<typeof getVisaoGeral>>["comercial"]`; `textoVariacao` e `FiltroPeriodo` com atalhos (T7); `CardDegrade`, `moeda`, `plural`, `Skeleton` existentes.
- Produces (todas recebem `comercial: ResumoComercial | undefined` e mostram `Skeleton` sem dados):
  - `KpisComerciais`: quatro `CardDegrade`: "Vendas × meta" (valor `"${vendas.quantidade.atual} de ${meta.periodo}"`, legenda `"${atingidoPct}% da meta"` + `" · projeção ${projecaoMes} no mês"` quando não nulo, `info` com a regra da meta), "Faturamento" (`moeda`, legenda `textoVariacao`), "Leads novos" (legenda `textoVariacao`), "Conversão da coorte" (`"${conversaoPct}%"`, legenda `"${compraram} de ${leadsNovos.atual} compraram até hoje"`, `info` "Lead que chegou no período e comprou em qualquer data; sem comparação porque a coorte anterior teve mais tempo"); abaixo, uma linha "Clientes existentes: N vendas · R$ X (recompra ou novo pacote; fora da conversão)".
  - `PorOrigem`: tabela (Origem | Leads novos | Compraram | Conversão | Faturamento) com rótulos `anuncio → "Anúncio"`, `link → "Link"`, `busca → "Busca"`, `outro → "Outro"`, `direto → "Direto"` e app `"Anúncio · Instagram"` etc.; segunda lista "Por anúncio" com `titulo ?? anuncioId ?? "Anúncio sem identificação"`; vazio: "Nenhum lead novo no período."
  - `Atendimento`: "Primeira resposta (mediana)" em minutos (`"32 min"`, ≥ 60 → `"1 h 05"`, `null` → `"—"`) com `"antes: ${anterior}"`; "Leads novos sem resposta" com o número.
- Rota: cabeçalho "Visão geral" / "O comercial está indo bem? Vendas contra a meta, leads novos, origem e conversão"; ordem dos blocos: filtros → `KpisComerciais` → grid `PorOrigem` (2/3) + `Atendimento` (1/3) → grid `DesempenhoVendedores` + `AlertasOperacao` (mantidos). Removidos da rota: `Kpis`, `VendasPorCategoria`, `PipelinePorEtapa`, `VendasRecentes`. Layout mobile primeiro e tokens de `docs/design.md`; referência visual `docs/ref/ui/03-admin-visao-geral.png` só para o estilo dos cartões.

- [ ] **Step 1: Ajustar `getVisaoGeral`** (remover `getPipeline`; resposta `{ alertas, vendas, comercial }`) e a rota para compilar com os componentes novos ainda vazios (`PROTO_BUN_VERSION=1.3.11 bun run typecheck` → FAIL enquanto `pipeline` for lido na rota; é o "teste" desta tarefa de interface).
- [ ] **Step 2: Implementar** os três componentes e a rota; apagar `VendasRecentes.tsx` (`git rm`).
- [ ] **Step 3: Verificar** `PROTO_BUN_VERSION=1.3.11 bun run check` → PASS; `grep -rn "VendasRecentes" src` vazio; `PROTO_BUN_VERSION=1.3.11 bun run dev` e abrir `/visao-geral` como admin: carregando, vazio ("Nenhum lead novo no período.") e erro ("Tentar de novo") visíveis; trocar atalho e vendedor refaz a consulta.
- [ ] **Step 4: Commit** — `feat(visao-geral): tela comercial com vendas × meta, origem e atendimento`

### Task 9: Pipeline por etapa e resumo do período mudam de aba

**Files:**
- Modify: `src/routes/pipeline.tsx:95-101`, `src/routes/vendas.tsx:41-96`

**Resources:** none. **Depends-on:** none (enquanto a T8 não roda, os blocos aparecem nas duas abas; nada quebra).

**Interfaces:**
- Consumes: `PipelinePorEtapa({ colunas })` (aceita `Omit<ColunaPipeline<unknown>, "cards">[]`; as colunas de `getPipeline` servem direto), `VendasPorCategoria({ categorias })`, `CardDegrade`, `getResumoDinheiro({ data: { periodo, vendedorId } })`, `rotuloMes`.
- Produces: `/pipeline` mostra `PipelinePorEtapa` logo abaixo de `Kpis` (e `Skeleton` enquanto `!pipeline.data`); `/vendas` ganha a `Secao id="resumo" icone={BarChart3} titulo="Resumo do período" subtitulo="Vendido, comissão a pagar e vendas por categoria no período escolhido."` com dois `CardDegrade` ("Vendido no período", "Comissão a pagar dia 10", mesmos textos de `Kpis.tsx`) e `VendasPorCategoria`, alimentados por `useQuery({ queryKey: ["vendas", "resumo", filtro], queryFn: () => getResumoDinheiro({ data: { periodo, vendedorId } }) })`; erro: `<p role="alert">Não deu para carregar o resumo do período.</p>`.

- [ ] **Step 1: Implementar** as duas rotas.
- [ ] **Step 2: Verificar** `PROTO_BUN_VERSION=1.3.11 bun run check` → PASS; em `bun run dev`, `/pipeline` mostra o funil por etapa e `/vendas` o resumo acima da lista; o filtro de vendedor e período da aba Vendas recorta o resumo.
- [ ] **Step 3: Commit** — `refactor(pipeline,vendas): pipeline por etapa e resumo do período mudam de aba`

### Task 10: Documentação e checagem final

**Files:**
- Modify: `docs/architecture.md` (tabela de rotas: `/visao-geral`, `/pipeline`, `/vendas`, `/configuracoes`; tabela de módulos: `configuracoes.ts` com `definirMetaVendasDia`, `visao-geral.ts` com `lerComercial`, linha nova `comercial.ts`; lista de migrações com `0006` e `0007`; seção "Ingestão" com a regra da origem; parágrafo do `db:origem` junto do instalador), `docs/onboarding.md` (comando `bun run db:origem`, "schema migrado (0001 a 0007)"), `AGENTS.md` (comandos de banco: `bun run db:origem`, exige autorização e só leitura na Evolution)
- **Resources:** contêiner `wakecrm-teste-vc10`, porta 54410. **Depends-on:** T1–T9.

- [ ] **Step 1: Escrever** as alterações de doc (texto normal, uma linha por fato novo; nada de reescrever seções que não mudaram).
- [ ] **Step 2: Checagem final**

Run: `git diff --check && PROTO_BUN_VERSION=1.3.11 bun run check && PROTO_BUN_VERSION=1.3.11 bun run build && NOME=wakecrm-teste-vc10 PORTA=54410 bash scripts/banco-teste.sh && PROTO_BUN_VERSION=1.3.11 PORTA=54410 bun run test:db`
Expected: tudo PASS; `git status` sem `.env`, dumps ou artefatos; `docker rm -f wakecrm-teste-vc1 wakecrm-teste-vc3 wakecrm-teste-vc4 wakecrm-teste-vc5 wakecrm-teste-vc6 wakecrm-teste-vc10` ao final.

- [ ] **Step 3: Commit** — `docs: visão comercial, origem do lead e db:origem`

---

## Handoff (preencher na execução, formato `docs/handoff.md.template`)

Objetivo: este plano. Estado verificado / checagens / pendências / bloqueios / próxima ação: a cargo do controlador ao fim de cada onda. Pendências já conhecidas: aplicar a 0007 e rodar `db:origem` em produção exigem autorização do dono; `scripts/migrar.db.test.ts` colide com o plano paralelo de pipeline (0008+).
