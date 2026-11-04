# Qualidade

## Comandos

| Comando | O que prova |
|---|---|
| `bun run lint` | ESLint 9 + typescript-eslint `strict` + React Hooks + Prettier + regras locais `quality/*` e fronteiras do projeto |
| `bun run typecheck` | `tsc --noEmit` com TypeScript `strict` |
| `bun run test` | testes `bun:test` (`src/**/*.test.ts`) |
| `bun run test:db` | testes de banco (`*.db.test.ts`) contra o Postgres descartável de `scripts/banco-teste.sh`; `PORTA=NNNN` escolhe outro contêiner |
| `bun run quality:rules` | self-check das regras locais (`scripts/verify-quality-rules.mjs` sobre `eslint-rules/index.cjs`) |
| `bun run check` | lint, tipos, testes puros e self-check, em sequência; sem build, rede, banco ou segredo (`test:db` fica fora) |
| `bun run lint:typed` | perfil tipado separado (`eslint.typed.config.mjs`): `no-floating-promises` e `no-misused-promises` |
| `bun run build` | build Vite/Nitro de produção |
| `bun run db:check` | views e privilégios das roles no banco real (exige `.env`) |

O CI (`.github/workflows/publish-container.yml`) roda `bun run check` no job `check`
antes do job `publish`. Rode `bun run check` antes de concluir qualquer mudança de
código e `bun run build` quando mexer em rota, servidor ou configuração de build.

## Regras de base

- TypeScript `strict`; presets oficiais do ESLint e do typescript-eslint.
- Limite de 350 linhas por arquivo (`quality/max-lines`) e organização proporcional ao
  comportamento.
- Sem `console` direto fora de exceções registradas (`quality/no-direct-console`).
- Fronteira de dados, todas em `error`:
  - só `src/server/db.ts` importa `pg` (`no-restricted-imports`);
  - só `src/server/db.ts` lê `DATABASE_URL`, `DATABASE_URL_RW` e `DATABASE_URL_MOTOR`
    (`no-restricted-syntax`);
  - componentes, rotas e features não importam `src/server/db.ts`
    (`import-x/no-restricted-paths`) nem usam `getPool`/`getPoolRw`
    (`quality/no-direct-data-access`).
- Validação de entrada com Zod e autorização no servidor; erro sem segredo.

### Linha de base (regras herdadas em `warn`)

Medida por regra antes de definir severidade; regra sem violação entrou como `error`.
Recontada em 05/11/2026 ao fechar as fases 1 a 4 com `bunx eslint . -f json`, contando por
`ruleId`: **0 erros, 63 avisos**. A coluna "04/11" é a linha de base original (40 avisos).

| Regra | 04/11 | 05/11 | Severidade |
|---|---|---|---|
| `react-refresh/only-export-components` | 6 | 16 | warn (já era) |
| `complexity` (12) | 13 | 20 | warn |
| `quality/max-lines` (350) | 6 | 8 | warn |
| `max-lines-per-function` (150) | 5 | 8 | warn |
| `quality/no-direct-console` | 4 | 4 | warn |
| `max-statements` (20) | 2 | 4 | warn |
| `import-x/no-duplicates` | 2 | 2 | warn |
| `@typescript-eslint/no-unused-vars` | 2 | 1 | warn (antes `off`) |
| `max-depth`, `max-params`, `max-nested-callbacks`, `no-empty`, `no-var`, `prefer-const`, `import-x/no-unresolved` | 0 | 0 | error |

Plano de redução: não refatorar só para zerar. Cada arquivo que uma fase tocar sai abaixo
do limite ou registra o motivo aqui. Quando uma regra chegar a zero, ela vira `error`. Não
use ignore amplo nem comentário de disable para esconder violação.

Arquivos acima de 350 linhas (`quality/max-lines`):

- Legado, não tocados pelas fases novas: `src/routes/wf02.tsx` (951), `src/components/ui/sidebar.tsx`
  (745, vendor do shadcn), `src/routes/admin.tsx` (590), `src/routes/reports.tsx` (581),
  `src/features/opportunities/OpportunityWorkspace.tsx` (421). `src/routes/index.tsx` saiu da
  lista (reescrita na interface nova).
- Novos nas fases 2-3: `src/server/motor/qualificador.ts` (522, SQL literal do legado; dividir o
  SQL em arquivo irmão, como `redator-sql.ts`, fica deferido), `src/server/motor/redator.ts`
  (365) e `src/server/motor/redator.db.test.ts` (366).

Outros avisos novos vêm de portas literais dos workflows (`validarPorteiro`,
`montarPromptRedator`, `normalizarVenda` com complexidade alta por tolerar vários formatos de
webhook) e de componentes de configuração que exportam hook ou helper junto do componente
(`react-refresh`).

### Lint tipado

`bun run lint:typed`: perfil separado (`no-floating-promises`, `no-misused-promises`), fora do
`check`. A última contagem registrada é de 04/11/2026 (1 achado em `src/routes/__root.tsx`) e
**não foi refeita** depois das fases 2 a 4. Quando o primeiro achado for corrigido, o perfil
entra no `check` como `error`.

## Estratégia de testes

- Teste lógica com decisão: filas, priorização, cálculo, normalização, autorização.
  Exemplos: `src/server/motor/distribuicao.test.ts`, `src/server/motor/ritmo.test.ts`,
  `src/server/motor/valor.test.ts`, `src/server/vendas/normalizar.test.ts`,
  `src/server/vendas/regras.test.ts`, `src/features/preferencias/preferencias.test.ts`,
  `src/components/shell/navegacao.test.ts`.
- Não escreva teste que só repete a implementação. Não há suíte E2E.
- Testes de banco ficam em `*.db.test.ts`, com `describe.skipIf(!bancoTesteAtivo)`
  (`TESTE_BANCO=1`, definido por `scripts/test-db.sh`); por isso `bun run test` os pula
  e `bun run test:db` os roda. Sobe-se o banco com `bash scripts/banco-teste.sh`
  (Postgres 14 em Docker, porta 54339, migrações 0001 a 0005 aplicadas; 0001 e 0002
  reaplicadas por cima para provar idempotência). `NOME` e `PORTA` escolhem outro contêiner
  (`PORTA` também em `test:db`), para suítes em paralelo.
- Isolamento: a role real do motor (`wakecrm_motor`) não tem DELETE, então os testes
  não limpam o banco; cada um usa dado único (`telefoneUnico`, `criarVendedor`,
  `desativarTodos` em `src/server/motor/banco-teste.ts`). Testes de privilégio são
  positivos e negativos, com as roles reais. Testes que mexem em estado global
  (`configuracoes`, ritmo, cota do dia) devem preparar o estado em `beforeEach`.
- **IA sem rede:** as tarefas (`qualificador`, `redator`, `transcricao`) recebem o
  `ClienteIa` por parâmetro. Os testes usam `src/server/ia/falso.ts`; o cliente real
  (`openai.ts`) é testado com um `fetch` injetado. Nenhum teste chama a OpenAI.
- **Evolution sem rede:** o envio e a transcrição recebem o `AdaptadorEvolution` por
  parâmetro; os testes usam um adaptador falso que implementa `enviar`, `baixarMidia` e
  `estadoConexao`, inclusive `ErroEnvio` com `certeza`. O adaptador real depende da Task 13.
- Relógio e janela: funções com horário (`dentroDaJanela`, `expiradoPorHorario`,
  `tarefaExpirarFollowups`, `fechamento`, `dinheiro`) aceitam `agora` para o teste fixar o
  instante; não dependa da hora real.
- Migrações: `migracoes*.db.test.ts` provam que 0004 e 0005 aplicam, são idempotentes e
  concedem só os grants previstos.
- `db:check` continua sendo a prova de views e privilégios no ambiente autorizado.
- PWA, push e retorno do WhatsApp só contam como prontos depois de teste em aparelho
  real. Mock, build isolado ou inspeção visual não provam produção.
- Cobertura por fase: fase 1 (distribuição, fila, ingestão, saúde, notificações, respostas
  rápidas, envio, migrações, virada); fases 2-3 (transcrição, qualificador, redator, ritmo,
  aprovação, envio dos follow-ups, painel de IA, configurações, visão geral); fase 4
  (normalização e regras de venda, processador de vendas, fechamento, dinheiro). O
  normalizador de eventos da Evolution depende da Task 13.

## Avaliação do harness

- Método: casos descartáveis de `docs/07-harness-evaluation.md` do toolkit, fora do
  repositório, com o avaliador do próprio toolkit. Resultados em `docs/setup.md`.
- Rode de novo os casos relevantes depois de mudar instruções, memória, skills ou
  orquestração. Identifique cliente e modelo; caso sem observação é "não rodado".
- Melhoria do harness: adaptação nativa inspirada no Harness2 (prompt 15 do toolkit,
  `docs/prompts/15-harness-improvement.md`, guia `docs/tools/23-harness2.md`). Uma falha
  observada justifica **uma** comparação base × candidato com as mesmas checagens
  independentes; setup que passa não ganha mudança inventada. O CLI oficial do Harness2
  não foi selecionado.
- Invocação (cole na conversa do agente):

  ```text
  Read https://raw.githubusercontent.com/soumatheusgomes/vibe-coding-toolkit/main/docs/prompts/15-harness-improvement.md and execute its Prompt section to set up a bounded harness improvement workflow in this project.
  ```

## Revisão depois de implementar ou corrigir

Escolha o escopo da revisão pelo risco e pelo diff real. Use revisão independente para
trabalho não trivial quando disponível (`/code-review`, `pr-review-toolkit`,
`differential-review`). Registre o alvo exato, chamadores, contratos e testes ligados,
achados confirmados e cobertura. Rodadas extras só com evidência nova ou risco aberto;
uma contagem pedida pelo usuário é respeitada sem reiniciar.

Termine quando os achados relevantes estiverem resolvidos ou com destino explícito, as
checagens afetadas passarem e os riscos residuais estiverem registrados.

## Revisão de segurança

- Prompt adotado: `docs/prompts/13-security-review.md` do toolkit, revisão
  `21b71b68679c11184f49c23168852014bf6dde8b` (não copiado; consulte a fonte).
- Modo repositório (linha de base, não precisa de PR):

  ```text
  Read https://raw.githubusercontent.com/soumatheusgomes/vibe-coding-toolkit/main/docs/prompts/13-security-review.md and execute the entire “Prompt” block in this repository. Use repository mode, preserve my current client/model/authentication, and save a redacted report outside the repository.
  ```

- Modo diff: troque "repository mode" por
  `Use diff mode, base=<ref real>, head=<ref real>, comparison=endpoint or merge-base, dirty=exclude or include.`
- Relatório: privado, redigido, **fora do repositório** (por exemplo
  `~/wakecrm-security/AAAA-MM-DD-<escopo>.md`), no formato
  `templates/security-review.md.template` do toolkit.
- A revisão é só leitura: não instala, não corrige, não sonda produção nem serviço
  externo. Para diffs sensíveis use também a skill `differential-review`; sem ela,
  rastreie o código manualmente e registre isso.
- Pontos de entrada a rastrear neste projeto: `createServerFn` em `src/server/`,
  `POST /api/push/enviar`, sessão/cookie em `src/server/auth.ts`, os webhooks
  `/api/webhooks/*`, o cliente de IA (`src/server/ia/`) e a decisão de aprovação
  (`src/server/aprovacao.ts`).
- Auditoria avançada (prompt 16 do toolkit) é opcional e nunca roda sozinha.

## Dependências e entrega

`bun audit` em 04/11/2026:

- Antes do setup: 41 avisos no total, **27 em produção**, incluindo 3 críticos:
  XSS refletido em respostas de server function do TanStack Start
  (GHSA-qx66-fv34-fjm8) e `seroval` (GHSA-p6vx-979v-rg4c).
- Correção aplicada dentro da mesma major: `@tanstack/react-start` 1.169.4,
  `@tanstack/react-router` 1.170.46, `@tanstack/router-plugin` 1.168.48,
  `@tanstack/react-query` 5.105.3, `vite` 8.3.5. Exigiu ajustar os `errorComponent`
  para `ErrorComponentProps` (o erro agora é `unknown`).
- Depois: **10 em produção** (7 high, 2 moderate, 1 low), nenhum crítico. Restantes
  incluem `zod <4.6.6`: a correção é a major 4, migração incompatível que precisa de
  decisão própria. Revisar os demais com `bun audit --prod` no próximo ciclo de
  dependências.

Lint e build passando não significam auditoria limpa. Checagens são comandos
explícitos; hooks de Git, bloqueio de push e exigência de branch não são padrão.
Atualize este documento junto com scripts e regras que mudarem.
