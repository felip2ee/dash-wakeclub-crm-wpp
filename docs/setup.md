# Setup do toolkit e evidência

## Fonte e contexto

- Data: 04/11/2026.
- Toolkit: `soumatheusgomes/vibe-coding-toolkit`, revisão
  `21b71b68679c11184f49c23168852014bf6dde8b` (29/10/2026), clonada fora do projeto.
  Todos os guias e templates usados vêm dessa revisão. Prompt executado:
  `docs/prompts/12-existing-project-setup.md`.
- Cliente: Claude Code (extensão VS Code) no macOS. Modelo principal preservado; a
  autenticação e as permissões não foram alteradas.
- Runtime: Node 26.10, Bun 1.3.11 local via `proto` (imagem usa 1.3.14), Git 2.39.
- Política de subagentes: delegação autorizada pelo prompt. Modelos usados neste
  setup: `sonnet` para inventário do catálogo, regras de qualidade e casos de harness;
  `haiku` para o caso de descoberta de instruções. Custo e tokens não foram medidos.

## Decisões e fontes

- Stack preservada: TanStack Start, Vite, `pg` sem ORM. Os padrões do toolkit para
  Next.js e Drizzle não se aplicam e não foram introduzidos.
- Perfil de qualidade: "advanced" não-Next do toolkit (`templates/eslint/`), mesclado
  no `eslint.config.js` existente. Biome não foi adotado (já há ESLint + Prettier).
- Segurança de dependências: atualização dentro da mesma major do grupo TanStack e
  Vite para fechar 3 avisos críticos (ver `docs/quality.md`). `zod` 4 fica para uma
  decisão própria (major incompatível).
- Context7 não pôde ser consultado (plugin sem autenticação). As decisões de versão
  usaram `bun audit`, o changelog implícito nas mensagens de tipo do TanStack e o
  código instalado em `node_modules`. Revisitar com Context7 depois da autenticação.
- Documentação: `docs/current-architecture.md` virou `docs/architecture.md`, com os
  links ajustados em `plan(2).md` e no design do WakeCRM. O antigo `AGENTS.md` (266
  linhas) foi encurtado. As seções de mandato e fases foram para `PRODUCT.md`, e as de
  base, responsabilidade dos dados e semântica foram para `docs/architecture.md`, sem
  mudar o texto.

## Componentes

| Componente | Ação e motivo | Escopo | Estado e evidência |
|---|---|---|---|
| Superpowers | reusado | usuário (plugin) | ativo; skills de brainstorming e de escrita disparadas nesta sessão |
| Ponytail | reusado, modo `full` registrado no AGENTS.md | usuário (plugin) | ativo (hook de sessão) |
| Caveman | reusado, só na conversa | usuário (plugin) | ativo (hook de sessão) |
| Política de subagentes | seção no AGENTS.md + `.claude/rules/parallel-subagent-driven-development.md` | projeto | arquivo presente; aplicada neste setup (escritores com arquivos disjuntos) |
| RTK | 0.52.0; hook nativo instalado com `rtk init -g --auto-patch` (autorizado em 04/11/2026), com backup das configurações anteriores | usuário | `rtk init --show` diz que o hook `rtk hook claude` está em `PreToolUse` e que o `~/.claude/CLAUDE.md` importa `@RTK.md`. `rtk git status` funciona. Na mesma sessão já se viu o hook filtrando a saída de `ls` (`[+2 hidden: rtk recall …]`) |
| Context7 | plugin `context7@claude-plugins-official` habilitado | usuário (plugin) | **bloqueado**: precisa de autenticação pelo `/mcp`. Não foi criado servidor duplicado |
| Graphify | 0.9.67 reusado; `.graphifyignore` criado; grafo AST regenerado | usuário (CLI) + projeto | `graphify update .` → 1240 nós, 2401 arestas; `.claude/skills` excluído; consulta `getPool` devolve `src/server/db.ts`. Sem extração semântica, sem hook de Git |
| Regras de qualidade ESLint | perfil avançado não-Next | projeto | `bun run quality:rules` → 3 × `ok`; contagens em `docs/quality.md` |
| Lint tipado | `eslint.typed.config.mjs` separado | projeto | 1 aviso, cerca de 5,4 s |
| Skills Vercel para web | `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`, `writing-guidelines`, `vercel-react-view-transitions`, `find-skills` | projeto (`.claude/skills`, `skills-lock.json`) | instaladas por `npx skills@latest add … --agent claude-code`; frontmatter conferido. A descoberta em sessão nova ainda não foi observada |
| Skills Vercel de deploy (`vercel-optimize`, `deploy-to-vercel`, `vercel-cli-with-tokens`) | não se aplica: deploy é Docker/GHCR/Portainer | — | não instaladas |
| `vercel-react-native-skills` | não se aplica: não é React Native | — | — |
| `next-dev-loop`, `next-bundle-optimizer` | não se aplica: não é Next.js | — | — |
| `supabase-postgres-best-practices` | instalada (vale para qualquer Postgres) | projeto | presente |
| `shadcn` | instalada | projeto | presente; contém `scripts/showcase-coverage.mjs`, script local que lista componentes e não foi executado |
| `differential-review` | instalada (Trail of Bits) | projeto | presente |
| `gh-fix-ci` | não se aplica: o upstream é do Codex e a compatibilidade com Claude Code não está provada | — | — |
| Codex | não se aplica: só Claude Code | — | `AGENTS.md` continua compartilhável |
| Sentry MCP | não se aplica: o projeto não usa Sentry | — | — |
| Obsidian | não se aplica: não há necessidade nem destino | — | — |
| Hooks próprios | não se aplica: nenhuma lacuna pede hook; hookify instalado | — | nenhum hook criado |
| agent-browser / Chrome DevTools MCP | não instalados (são globais); usar as skills de navegador do cliente quando houver tarefa de UI | — | **não validado**: nenhum fluxo de navegador rodou neste setup |
| Anthropic skills (docx, pdf, pptx, xlsx, skill-creator) | reusadas: já disponíveis no cliente | usuário | — |
| aia-harness, plugins oficiais de revisão/commit | reusados | usuário | — |
| Revisão de segurança (prompt 13) | fonte e invocação registradas em `docs/quality.md` | projeto (doc) | caso de harness de revisão só leitura passou (abaixo). Linha de base do repositório **não rodada** |
| Avaliação do harness (prompt 14) | 3 casos do fixture + descoberta no projeto | fora do repo | ver "Memória e evidência do harness" |
| Harness2 (prompt 15) | adaptação nativa, invocação em `docs/quality.md`; CLI oficial não selecionado | projeto (doc) | sem falha observada, nenhuma comparação candidata |
| Memória | memória automática do Claude Code para este projeto (fora do repositório, carregada pelo cliente) + docs versionados como fonte durável | usuário + projeto | índice da memória vazio nesta data; os fatos duráveis estão nos docs |
| CI | job `check` antes do `publish` | projeto | YAML validado por parse; **execução no GitHub não observada** (sem push) |

## Documentação criada

| Destino do manifesto | Estado |
|---|---|
| `PRODUCT.md` | novo; inclui o histórico de fases movido do AGENTS antigo |
| `README.md` | atualizado (comandos, links e próxima entrega) |
| `AGENTS.md` | reescrito, mais curto, mantendo as convenções |
| `CLAUDE.md` | novo, `@AGENTS.md` |
| `docs/architecture.md` | renomeado de `current-architecture.md` + estado de 04/11 + regras vigentes |
| `docs/design.md` | novo, aponta para `src/styles.css` e `components.json` |
| `docs/onboarding.md` | novo |
| `docs/quality.md` | novo |
| `docs/setup.md` | este arquivo |

Extra: `docs/handoff.md.template` (template de handoff do toolkit, para trabalho entre
sessões). `ESPEC-*.md`, `plan(2).md` e o design do WakeCRM foram preservados; só o link
para a arquitetura mudou.

## Checagens

| Checagem | Antes | Depois |
|---|---|---|
| `bun run lint` | 0 erros, 6 avisos | 0 erros, 39 avisos (regras novas em `warn` com linha de base) |
| `tsc --noEmit` | **4 erros** (tipos de `bun:test`; bug real em `minha-fila.tsx`, onde `sugestaoUtilizavel` virava `true`) | 0 (`bun run typecheck`) |
| `bun test` | 2 passam | 2 passam |
| `bun run quality:rules` | não existia | 3 × `ok` |
| `bun run check` | não existia | código de saída 0 |
| `bun run build` | ok | ok |
| `bun audit --prod` | 27 (3 críticos) | 10 (0 críticos) |
| `git diff --check` | — | rodar antes do commit |

Recurso temporário: cópias descartáveis do fixture e o clone do toolkit, no scratchpad
da sessão, fora do repositório. Nada no banco nem em serviço externo.

Teste de fumaça do servidor buildado, sem `.env` e sem banco, na porta 3917: `/login`
respondeu 200 com `<title>Entrar — Wake Club</title>`, e `/` respondeu 307 para
`/login`. O processo foi encerrado em seguida. As telas com dados não foram abertas,
porque exigem banco.

Só tiveram revisão estática: o job de CI e a descoberta das skills em sessão nova.

## Memória e evidência do harness

Casos rodados em 04/11/2026 com Claude Code e subagentes de contexto limpo
(`sonnet`). Isso não equivale a reiniciar o cliente. Avaliador:
`scripts/validate-harness.mjs` do toolkit, fora do escopo de escrita dos agentes.

| Caso | Entrada | Resultado independente | Situação |
|---|---|---|---|
| Correção de fronteira | fixture intacto (5 de 7 passavam) | avaliador: 7 de 7, saída 0; `local-notes.txt` com o mesmo hash | passou |
| Handoff desatualizado | fixture + `HANDOFF.md` dizendo "DONE" | o agente rejeitou o handoff, corrigiu e reescreveu com evidência; avaliador 7 de 7, saída 0 | passou |
| Revisão de segurança só leitura | fixture intacto, relatório num destino privado | hashes iguais antes e depois; relatório aponta acesso entre tenants com exemplo concreto, local, impacto e confiança | passou |
| Descoberta de instruções (projeto real, `haiku`) | 7 perguntas | o agente achou o `check`, a skill de Postgres, a fronteira do `pg`, as regras de dados vigentes, a fase 1 e o contorno do proto, e a consulta ao grafo funcionou | passou, com uma ressalva: rodou antes de `docs/quality.md` e `docs/setup.md` existirem e apontou os links quebrados, que agora já existem |
| Reaplicação, conflito de recurso, bloqueio parcial, pausa/retomada | — | — | não rodados |

Um caso que passa uma vez é um teste de fumaça, não uma taxa de confiabilidade.

## Pendências e próxima entrega

1. **RTK:** numa sessão nova, confirmar que o `git status` sai filtrado sem duplicar o
   prefixo. Para desfazer: `rtk init -g --uninstall`.
2. **Context7:** autenticar o plugin pelo `/mcp` e fazer uma consulta real (resolver a
   biblioteca e depois consultar a documentação).
3. **Descoberta de skills** em sessão nova do cliente: abrir uma sessão e conferir se
   as 9 skills de `.claude/skills` aparecem.
4. **CI:** observar o job `check` na primeira execução depois do push.
5. **Telas com dados:** abrir `/`, `/kanban`, `/reports` e `/wf02` com banco depois do
   upgrade do TanStack. O teste sem banco cobriu só `/login` e o redirecionamento.
6. **Dívida:** `no-floating-promises` em `src/routes/__root.tsx`; 7 arquivos acima de
   350 linhas; `zod` 4.
7. **Linha de base de segurança** do repositório (prompt 13, modo repositório) quando
   for pedida.

Próxima entrega: fase 1 do WakeCRM (design em
`docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md`).

Para repetir este setup preservando o que foi customizado, rode o prompt 12 do toolkit
de novo. Ele reaproveita o que existe, não duplica skills nem hooks e reconfere a
evidência acima.
