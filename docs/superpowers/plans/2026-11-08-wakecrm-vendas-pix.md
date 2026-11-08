# Vendas diretas por Pix · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** comprovante de Pix enviado pelo lead no WhatsApp vira venda "direta" sozinho quando tudo confere, ou pergunta ao admin quando não; o faturado mostra App e Direta.

**Architecture:** tarefa nova do motor (`comprovantes`) lê imagens/PDFs de lead com a IA (visão), deduz as horas pela conversa e decide; venda registrada reusa o caminho da venda paga ligada ao lead (comissão, meta, etapa, saldo). Perguntas e estado ficam na tabela nova `comprovantes`; o admin responde em Dinheiro e configura chave/CNPJ/preços em Configurações.

**Tech Stack:** TanStack Start, React 19, Postgres 14 via `pg`, Zod, Bun, OpenAI Chat Completions (`ClienteIa`).

**Spec:** `docs/superpowers/specs/2026-11-08-wakecrm-vendas-pix-design.md` (inclui §10b, decisões do construtor).

## Global Constraints

- Português do Brasil em tela, comentário e doc; cada módulo de servidor começa com comentário do porquê.
- Só `src/server/db.ts` importa `pg`; módulo com `createServerFn` entra em `vite.config.ts` `importProtection.client.excludeFiles` (coordenador).
- SQL com casts explícitos (`$1::uuid`); `numeric` com `Number(...)`; datas em ISO no servidor; tela em `America/Sao_Paulo` via `src/lib/formato.ts`.
- Toda decisão do motor vira linha em `eventos_automacao` no mesmo comando (ou transação) que muda o dado.
- Nenhuma mensagem ao cliente; nada é enviado.
- Log sem conteúdo de comprovante (nome, CPF, chave).
- Pacotes: 1, 2 e 4 horas. Auto-registro exige chave ou CNPJ configurado, preço do pacote configurado, recebedor que confere, valor = preço de exatamente um pacote, horas deduzidas = esse pacote, pagamento ≤ 3 dias, sem repetição, sem venda do app parecida em 48 h.
- Admin corrige: horas inteiras 1–100, valor > 0.
- Testes de banco só em banco descartável (`NOME=wakecrm-teste-XX PORTA=NNNNN bash scripts/banco-teste.sh`), nunca `wakecrm-teste`/54339.

## Review Focus

1. Mesmo comprovante reenviado (print e depois PDF, sem E2E) → `repetido`, nenhuma venda nova (teste em T3).
2. Recebedor diferente da chave/CNPJ (comprovante de outra conta) → pergunta, nunca registro (teste em T3).
3. Venda do app com mesmo valor até 48 h depois de uma direta → venda do app entra e abre pergunta "possível venda repetida" (teste em T4).
4. "Não é venda" numa venda Pix registrada → estornada e saldo devolvido sem ficar negativo (teste em T5).
5. IA indisponível ou que falha → comprovante volta para nova tentativa, desiste após 3 com `falhou`, sem venda (teste em T3).

---

### Task 1: Migração 0009

**Files:** Create `db/migrations/0009_vendas_pix.sql`, `src/server/motor/migracoes-0009.db.test.ts`.
**Resources:** banco px1 / 54421. **Depends-on:** none.

- Tabela `wakeclub.comprovantes`: `id uuid pk default gen_random_uuid()`, `mensagem_id uuid unique null references mensagens`, `lead_id uuid not null references leads`, `hash text`, `e2e text`, `status text not null` check in (`lendo`, `nao_e`, `registrado`, `confirmar`, `recusado`, `repetido`, `falhou`), `tentativas smallint not null default 0`, `leitura jsonb`, `valor numeric(12,2)`, `pago_em timestamptz`, `horas_sugeridas integer`, `motivo text`, `venda_id uuid references vendas`, `venda_suspeita_id uuid references vendas`, `repetido_de uuid references comprovantes`, `decidido_por uuid references usuarios`, `decidido_em timestamptz`, `criado_em`/`atualizado_em timestamptz not null default now()` (+ trigger `set_atualizado_em`). Índices: `(status)` parcial `where status = 'confirmar'`; `(hash)`; único parcial `(e2e) where e2e is not null and status = 'registrado'`.
- `vendas_vinculada_por_valida`: adiciona `comprovante`.
- `eventos_automacao_entidade_valida`: adiciona `comprovante` (e permite `lead_id` nulo para ela, como `venda`).
- `configuracoes`: insere `venda_pix` = `{"chave": null, "cnpj": null, "precos": {"1": null, "2": null, "4": null}}` se não existir.
- Grants iguais ao padrão da 0008 (`wakecrm_motor`: select/insert/update em `comprovantes`).
- Idempotente (rodar duas vezes não falha).
- [ ] Teste que falha: tabela existe; status inválido → 23514; `vinculada_por = 'comprovante'` aceito; `venda_pix` com `precos` 1/2/4 nulos; reaplicar o arquivo não falha.
- [ ] Implementar; `PORTA=54421 bun run test:db src/server/motor/migracoes-0009.db.test.ts` PASS.

### Task 2: IA lê anexos (imagem e PDF)

**Files:** Modify `src/server/ia/tipos.ts`, `src/server/ia/openai.ts`, `src/server/ia/falso.ts`; Test `src/server/ia/openai.test.ts`.
**Resources:** none. **Depends-on:** none.

- `PedidoChat.anexos?: { mime: string; dados: Uint8Array; nomeArquivo: string }[]`.
- `openai.ts`: com anexos, `content` do usuário vira array: `{type:"text", text}` + para `image/*` `{type:"image_url", image_url:{url:"data:<mime>;base64,..."}}` + para `application/pdf` `{type:"file", file:{filename, file_data:"data:application/pdf;base64,..."}}`. Outros mimes → `ErroIa("anexo não suportado")`. Sem anexos, corpo idêntico ao atual.
- [ ] Testes com `fetchFn` falso: sem anexos o corpo não muda; imagem e PDF montam as partes acima; mime de vídeo lança.

### Task 6: Faturado por origem (App / Direta)

**Files:** Modify `src/server/comercial.ts`, `src/server/comercial.db.test.ts`, `src/features/visao-geral/KpisComerciais.tsx`, `src/server/dinheiro.ts`, `src/server/dinheiro.db.test.ts`, `src/features/dinheiro/ListaVendas.tsx`.
**Resources:** banco px2 / 54422. **Depends-on:** none (usa `origem_externa = 'pix'` só como texto).

- KPI de faturado do período ganha `faturadoApp` e `faturadoDireta` (`origem_externa <> 'pix'` / `= 'pix'`), mostrados abaixo do total ("App R$ x · Direta R$ y").
- Resumo de Dinheiro idem; `ListaVendas` mostra a origem de cada venda ("App" ou "Direta").
- [ ] Testes: uma venda `webhook` e uma `pix` no período → total soma as duas e cada parte bate.

### Task 3: Motor `comprovantes`

**Files:** Create `src/server/motor/comprovantes.ts`, `src/server/ia/prompts/comprovante.ts`, `src/server/motor/comprovantes.test.ts`, `src/server/motor/comprovantes.db.test.ts`; Modify `src/server/motor/vendas.ts` (só exportar `aplicarVinculo`, sem mudar comportamento), `src/server/motor/iniciar.ts`.
**Resources:** banco px1 / 54421. **Depends-on:** T1, T2.

**Produces (`comprovantes.ts`):**
```ts
export type ConfigPix = { chave: string | null; cnpj: string | null; precos: { 1: number | null; 2: number | null; 4: number | null } };
export async function lerConfigPix(db: ClienteDb): Promise<ConfigPix>;
export type Leitura = { ehComprovante: boolean; valor: number | null; pagoEm: string | null; pagador: string | null; recebedor: string | null; chaveRecebedor: string | null; cnpjRecebedor: string | null; e2e: string | null; legivel: boolean };
export type Decisao = { acao: "registrar"; horas: 1 | 2 | 4 } | { acao: "confirmar"; motivo: string };
export function decidir(l: Leitura, horasDeduzidas: number | null, ctx: { config: ConfigPix; agora: Date; vendaAppParecida: boolean; leadComDono: boolean }): Decisao; // pura
export async function registrarVendaPix(db: PoolClient, c: { comprovanteId: string; leadId: string; valor: number; horas: number; pagoEm: Date; e2e: string | null; evolutionMsgId: string | null; por: "comprovante" | { adminId: string } }): Promise<string>; // vendaId
export async function tarefaComprovantes(deps: { ia: ClienteIa; adaptador: AdaptadorEvolution; agora?: () => Date }): Promise<number>;
```
- Candidatas: mensagens `direcao='lead'`, `tipo in ('imagem','documento')`, `enviada_em > now() - 7 days`, com `evolution_msg_id`, sem linha em `comprovantes` (insere `lendo` com `for update skip locked`, até 5 por rodada). Falha da IA/mídia: `tentativas+1`, volta a ser candidata (status `lendo` com mais de 15 min é retomado); na 3ª, `falhou`.
- Repetição antes da IA: mesmo `hash` de comprovante `registrado`/`confirmar`/`recusado` → `repetido` (`repetido_de`). Depois da leitura: mesmo E2E em `comprovantes` ou `vendas.id_externo` (qualquer origem), ou sem E2E mesmo lead + valor + `pago_em` a ±10 min → `repetido`.
- `decidir` motivos (texto exato, primeiro que falhar): `"configure a chave Pix e os preços dos pacotes"`, `"comprovante ilegível"`, `"recebedor não confere com a chave/CNPJ da Wake"`, `"valor R$ <v> não bate com nenhum pacote"`, `"horas da conversa (<h> h) não batem com o valor"`, `"pagamento de mais de 3 dias"`, `"possível venda repetida com venda do app"`, `"lead sem dono"`. Recebedor confere se chave ou CNPJ lidos (só dígitos/minúsculas) igualam os configurados.
- Dedução das horas: segunda chamada à IA com as últimas 30 mensagens (texto e transcrições) e os preços; resposta `{ horas: 1|2|4|null, trecho: string }`.
- `registrarVendaPix`: insere `vendas` (`origem_externa 'pix'`, `id_externo` = e2e ou `msg:<evolutionMsgId>`, `status 'paga'`, `comprada_em = pagoEm`, `horas`, `valor`, `lead_id`), aplica vínculo pelo caminho atual (`aplicarVinculo`, vendedor = dono atual, `vinculada_por` `comprovante`/`admin`), credita horas e etapa como `vincular` faz para venda paga, chama `vendaAtrasada`, marca o comprovante `registrado` com `venda_id`, evento `sale_registered` (entidade `comprovante`).
- Pergunta: comprovante `confirmar` com `motivo`, `horas_sugeridas`, `leitura`; notificação para cada admin (`tipo 'comprovante'`, título "Comprovante para confirmar", corpo "<lead> · R$ <valor>", url `/vendas`).
- `iniciar.ts`: `agendar("comprovantes", 2 * MINUTO, ...)` só com `ia` e `adaptador`.
- [ ] `comprovantes.test.ts`: cada motivo de `decidir` e o caminho `registrar`.
- [ ] `comprovantes.db.test.ts` (IA e adaptador falsos): registra sozinho (venda `pix` paga, lead em Aluno com horas, saldo +2, comissão do dono, evento); recebedor errado → `confirmar`; mesmo hash → `repetido`; mesmo E2E → `repetido`; print e PDF sem E2E, mesmo valor/hora → `repetido`; imagem que não é comprovante → `nao_e`; mensagem de mais de 7 dias ignorada; IA falha 3 vezes → `falhou`; sem config → `confirmar` com o motivo de configuração.

### Task 4: Venda do app parecida com venda direta

**Files:** Modify `src/server/motor/vendas.ts`, `src/server/motor/vendas.db.test.ts`.
**Resources:** banco px2 / 54422. **Depends-on:** T3.

- Em `processarVenda`, venda nova `paga` ligada a lead: se existe venda `pix` paga do mesmo lead, mesmo valor, `comprada_em` até 48 h antes → insere comprovante `confirmar` (`mensagem_id` nulo, `motivo "possível venda repetida"`, `venda_id` = a direta, `venda_suspeita_id` = a do app) e notifica os admins. A venda do app segue como hoje.
- [ ] Teste: direta de R$ 720 ontem + app de R$ 720 hoje → as duas existem e há uma pergunta; valor diferente → nenhuma pergunta.

### Task 5: Admin — Configurações e "Vendas para confirmar"

**Files:** Create `src/server/vendas-pix.ts`, `src/server/vendas-pix.db.test.ts`, `src/features/configuracoes/VendaPix.tsx`, `src/features/dinheiro/ParaConfirmar.tsx`; Modify `src/routes/configuracoes.tsx` (desktop e celular), `src/routes/vendas.tsx`.
**Resources:** banco px1 / 54421. **Depends-on:** T3. vite: `"**/src/server/vendas-pix.ts"` (coordenador).

**Produces (`vendas-pix.ts`, todas `exigirAdmin`, pool do motor):**
```ts
getConfigPix GET → ConfigPix; definirConfigPix POST (chave/cnpj string|null até 140; precos 1/2/4 number|null > 0) → ConfigPix, evento config_changed;
getParaConfirmar GET → { perguntas: Pergunta[]; registradasRecentes: Registrada[] } // registradas automaticamente nos últimos 7 dias
confirmarComprovante POST { id: uuid; valor?: number>0; horas?: int 1..100; pagoEm?: iso; leadId?: uuid } → registra via registrarVendaPix (por adminId);
recusarComprovante POST { id: uuid; motivo: string 1..300 } → pergunta vira 'recusado'; registrado → estornar + saldo -= horas (mínimo 0) + 'recusado', evento;
resolverRepetida POST { id: uuid; desfazer: "direta" | "app" | "nenhuma" } → estorna a escolhida (direta devolve horas), fecha a pergunta.
```
- `VendaPix.tsx`: `Secao` "Venda direta por Pix" com chave, CNPJ e preço de 1 h, 2 h e 4 h; aviso "Sem chave/CNPJ e preços, todo comprovante vira pergunta."
- `ParaConfirmar.tsx` (topo de `/vendas`, só admin): contador; cada pergunta com miniatura (rota de mídia existente; sem mídia → "comprovante indisponível"), lead e dono, leitura, horas sugeridas, motivo; botões Confirmar / Corrigir e confirmar (diálogo com valor, horas, data) / Não é venda (motivo); repetida com as duas vendas e as três opções; lista "Registradas automaticamente" com "Não é venda".
- [ ] Testes de banco: confirmar registra; corrigir horas 3 grava 3; recusar pergunta não cria venda; recusar registrada estorna e devolve horas (saldo 1 − 2 → 0); resolverRepetida "app" estorna a do app; não-admin recusado pelo `exigirAdmin` (coberto pelo padrão das server fns).

### Task 7: Docs e verificação

**Files:** Modify `docs/architecture.md` (tabela de tarefas, modelo de dados, vendas por origem, rotas), `docs/quality.md` só se mudar comando.
**Resources:** banco px1 / 54421 (suíte completa). **Depends-on:** todas.
- [ ] `bun run check`, `bun run build`, `bun run test:db` completo, `git diff --check`.

## Ondas

- W1: T1, T2, T6 (arquivos e bancos independentes).
- W2: T3.
- W3: T4 (px2), T5 (px1).
- W4: T7.
