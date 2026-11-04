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
  - só `src/server/db.ts` lê `DATABASE_URL`/`DATABASE_URL_RW` (`no-restricted-syntax`);
  - componentes, rotas e features não importam `src/server/db.ts`
    (`import-x/no-restricted-paths`) nem usam `getPool`/`getPoolRw`
    (`quality/no-direct-data-access`).
- Validação de entrada com Zod e autorização no servidor; erro sem segredo.

### Linha de base de 04/11/2026 (regras herdadas em `warn`)

Medido por regra antes de definir severidade. Regra sem violação entrou como `error`.

| Regra | Violações | Severidade |
|---|---|---|
| `quality/max-lines` (350) | 6 arquivos (`wf02.tsx` 951, `sidebar.tsx` 745, `index.tsx` 678, `admin.tsx` 590, `reports.tsx` 581, `OpportunityWorkspace.tsx` 417) | warn |
| `complexity` (12) | 13 | warn |
| `react-refresh/only-export-components` | 6 | warn (já era) |
| `quality/no-direct-console` | 4 (`__root.tsx`, `server.ts` ×2, `start.ts`) | warn |
| `max-lines-per-function` (150) | 5 | warn |
| `@typescript-eslint/no-unused-vars` | 2 | warn (antes `off`) |
| `max-statements` (20) | 2 | warn |
| `import-x/no-duplicates` | 2 (`src/server.ts`) | warn |
| `max-depth`, `max-params`, `max-nested-callbacks`, `no-empty`, `no-var`, `prefer-const`, `import-x/no-unresolved` | 0 | error |

Total recontado em 04/11/2026 ao fechar a fase 1: 0 erros, 40 avisos (`eslint -f json`,
contagem por `ruleId`). Plano de redução: não refatorar só para zerar. Cada arquivo
que a fase do WakeCRM tocar sai abaixo do limite ou registra o motivo aqui.

Arquivos tocados pela fase 1 que seguem acima de 350 linhas:

- `src/routes/index.tsx` (678): a Task 12 reindentou o rodapé da conversa para incluir o
  composer de envio (+22 linhas). Extrair `RodapeConversa` fica deferido; a rota já era
  grande e a extração é refatoração própria.
- `src/routes/admin.tsx` (590): as Tasks 10 e 11 acrescentaram monitor da fila, peso e
  comissão, correção de dono e cadastro com peso/%. Dividir a tela em componentes por
  seção fica para a fase de componentização.

`src/routes/templates.tsx` saiu da lista (182 linhas).
 Quando uma
regra chegar a zero, ela vira `error`. Não use ignore amplo nem comentário de disable
para esconder violação.

### Lint tipado

`bun run lint:typed`: cerca de 5,4 s de relógio (9,7 s de CPU) nesta máquina. Achados:
`no-floating-promises` 1 (`src/routes/__root.tsx`), `no-misused-promises` 0. Os dois
ficam em `warn` e fora do `check` até o primeiro ser corrigido; aí o perfil entra no
`check` como `error`.

## Estratégia de testes

- Teste lógica com decisão: filas, priorização, cálculo, normalização, autorização.
  Exemplos atuais: `src/features/minha-fila/fila.test.ts`,
  `src/features/opportunities/timeline.test.ts`, `src/server/motor/distribuicao.test.ts`.
- Não escreva teste que só repete a implementação. Não há suíte E2E.
- Testes de banco ficam em `*.db.test.ts`, com `describe.skipIf(!bancoTesteAtivo)`
  (`TESTE_BANCO=1`, definido por `scripts/test-db.sh`); por isso `bun run test` os pula
  e `bun run test:db` os roda. Sobe-se o banco com `bash scripts/banco-teste.sh`
  (Postgres 14 em Docker, porta 54339, migrações aplicadas e reaplicadas).
- Isolamento: a role real do motor (`wakecrm_motor`) não tem DELETE, então os testes
  não limpam o banco; cada um usa dado único (`telefoneUnico`, `criarVendedor`,
  `desativarTodos` em `src/server/motor/banco-teste.ts`). Testes de privilégio são
  positivos e negativos, com as roles reais.
- `db:check` continua sendo a prova de views e privilégios no ambiente autorizado.
- PWA, push e retorno do WhatsApp só contam como prontos depois de teste em aparelho
  real.
- Fase 1: distribuição, fila (sequência por chave, retentativas, órfãos), ingestão, saúde,
  notificações, respostas rápidas, envio, migrações e virada têm testes de banco. O
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
  `POST /api/push/enviar`, sessão/cookie em `src/server/auth.ts` e, na fase 1, os
  webhooks `/api/webhooks/*`.
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
