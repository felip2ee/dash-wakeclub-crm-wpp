# Qualidade

## Comandos

| Comando | O que prova |
|---|---|
| `bun run lint` | ESLint 9 + typescript-eslint `strict` + React Hooks + Prettier + regras locais `quality/*` e fronteiras do projeto |
| `bun run typecheck` | `tsc --noEmit` com TypeScript `strict` |
| `bun run test` | testes `bun:test` (`src/**/*.test.ts`) |
| `bun run quality:rules` | self-check das regras locais (`scripts/verify-quality-rules.mjs` sobre `eslint-rules/index.cjs`) |
| `bun run check` | os quatro acima, em sequência; sem build, rede, banco ou segredo |
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
| `quality/max-lines` (350) | 7 arquivos (`wf02.tsx` 948, `sidebar.tsx` 744, `index.tsx` 655, `reports.tsx` 578, `admin.tsx` 539, `OpportunityWorkspace.tsx` 416, `templates.tsx` 369) | warn |
| `complexity` (12) | 12 | warn |
| `react-refresh/only-export-components` | 6 | warn (já era) |
| `quality/no-direct-console` | 4 (`__root.tsx`, `server.ts` ×2, `start.ts`) | warn |
| `max-lines-per-function` (150) | 3 | warn |
| `@typescript-eslint/no-unused-vars` | 3 | warn (antes `off`) |
| `max-statements` (20) | 2 | warn |
| `import-x/no-duplicates` | 2 (`src/server.ts`) | warn |
| `max-depth`, `max-params`, `max-nested-callbacks`, `no-empty`, `no-var`, `prefer-const`, `import-x/no-unresolved` | 0 | error |

Total: 0 erros, 39 avisos. Plano de redução: não refatorar só para zerar. Cada arquivo
que a fase do WakeCRM tocar sai abaixo do limite ou registra o motivo aqui. Quando uma
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
  `src/features/opportunities/timeline.test.ts`.
- Não escreva teste que só repete a implementação. Não há suíte E2E nem banco de
  teste versionado; o que depende de banco é verificado por `db:check` e teste de
  privilégio positivo/negativo no ambiente autorizado.
- PWA, push e retorno do WhatsApp só contam como prontos depois de teste em aparelho
  real.
- Para a fase 1 do WakeCRM, o design exige teste da distribuição por peso, categoria de
  venda, comissão, cota de ritmo e do normalizador de eventos.

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
