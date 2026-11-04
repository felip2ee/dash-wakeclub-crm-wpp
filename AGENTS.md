# AGENTS.md · WakeCRM (Wake Club)

Instruções compartilhadas para agentes. Este arquivo é curto de propósito: o detalhe
mora nos documentos abaixo. Português do Brasil em tela, comentário e documentação;
nomes técnicos exigidos por bibliotecas, APIs e pelo plano ficam como estão.

## Produto e fontes

- Produto, escopo e roadmap: `PRODUCT.md`.
- Arquitetura atual, dados, roles e **regras de dados vigentes**: `docs/architecture.md`.
- Arquitetura do motor próprio (sem n8n): `docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md`,
  com plano da fase 1 em `docs/superpowers/plans/2026-11-04-wakecrm-fase-1.md`. As regras
  de dados de `docs/architecture.md` já refletem o motor próprio.
- UX de referência: `plan(2).md`. Contratos já implementados: `ESPEC-PAINEL-EQUIPE.md`
  e `ESPEC-BOTAO-NAO-ATENDER.md`.
- Interface: `docs/design.md`; referências visuais obrigatórias em `docs/ref/`. Preparação local: `docs/onboarding.md`. Checagens:
  `docs/quality.md`. Ferramentas e evidência do setup: `docs/setup.md`.
- `../CLAUDE.md`, `../db/` e `../n8n/`, citados em documentos antigos, **não existem
  neste checkout**. Os workflows n8n exportados estão em `docs/n8n-legado/` (só fonte,
  nunca reativar). Migrações do schema: `db/migrations/`.

Se uma tarefa exigir nova escrita, nova fonte de estado ou mudança de responsabilidade
que nenhum documento acima autoriza, pare e proponha a menor decisão explícita.

## Stack

TanStack Start + React 19 + Vite 8 + Nitro, TanStack Query, Tailwind v4 + shadcn/ui,
PostgreSQL 14 via `pg` (sem ORM), Zod, Bun (`bun.lock`). Container `oven/bun:1.3.14-alpine`.

## Comandos canônicos

- Instalar: `bun install --frozen-lockfile`
- Desenvolver: `bun run dev`
- Lint: `bun run lint` (inclui as regras locais `quality/*`)
- Lint tipado (separado, mais lento): `bun run lint:typed`
- Tipos: `bun run typecheck`
- Testes: `bun run test` (`bun test`)
- Self-check das regras locais: `bun run quality:rules`
- Build: `bun run build`
- Verificação combinada (sem rede, banco ou build): `bun run check`
- Banco (exige `.env` e autorização para o ambiente alvo): `bun run db:check`, `bun run db:apply`,
  `bun run db:migrate`
- Testes de banco (Docker local): `bash scripts/banco-teste.sh && bun run test:db`
- Mudança só documental: `git diff --check` e revisão do diff.

Se o `proto` não achar versão do Bun, veja `docs/onboarding.md`.

## Acordos de trabalho

- Leia as instruções e o código relevante antes de editar. Separe observação, suposição,
  decisão e evidência.
- Defina critério de aceite e comandos antes de implementar. Teste comportamento e falhas
  relevantes; correção de bug precisa de reprodução e prova de regressão quando viável.
- Faça a menor mudança suficiente, reutilizando padrões, componentes e dependências.
  Nada de abstração, opção ou dependência para necessidade não pedida.
- Preserve mudanças locais, validação, tratamento de erro, segurança, acessibilidade e
  requisitos explícitos. Não enfraqueça regra, teste ou permissão para passar checagem.
- Não transforme suposição em fato nem integração pendente em resultado simulado. Mock,
  build isolado ou inspeção visual não provam produção.
- Atualize o documento responsável junto com a mudança de comportamento, comando,
  schema, fronteira ou configuração.
- Publicar, aplicar schema, ativar workflow, enviar mensagem a terceiros, custo e ação
  destrutiva exigem autorização específica. Instalar ferramenta não a concede.

## Continuidade

- Durante trabalho autorizado, responda perguntas de status e continue. Pare se o
  usuário pausar, cancelar ou mudar o objetivo.
- Um bloqueio para só o que depende dele; termine o que for independente e seguro.
- Se um agente falhar, confirme que parou antes de assumir seus arquivos e retome de um
  ponto verificado. Não repita tentativa idêntica sem evidência nova.
- Trabalho que atravessa sessões mantém um handoff curto no plano/tarefa (objetivo,
  estado verificado, checagens, pendências, bloqueios, próxima ação), no formato de
  `docs/handoff.md.template`. Ao retomar, confira arquivos, Git, checagens e processos.

## Ferramentas e estilo

- **Ponytail** `full` para código; **Caveman** só na conversa (código, docs e commits em
  texto normal); **Superpowers** proporcional ao escopo.
- **Context7** para documentação atual de bibliotecas, um conceito por consulta, sem
  segredo nem código privado. Indisponível: use fonte oficial e registre.
- **RTK**: com hook nativo ativo, não duplique; sem hook, prefixe comandos suportados;
  `rtk proxy <comando>` para saída original. Estado atual em `docs/setup.md`.
- **Graphify**: com `graphify-out/graph.json`, comece perguntas estruturais por
  `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"` ou `graphify explain "<X>"`.
  Depois de mudar código, `graphify update .` (AST local, sem API). Registre quando o
  grafo estiver desatualizado; não invente relações. Exclusões em `.graphifyignore`.
- **LLMs**: preserve o cliente, o modelo principal e a autenticação. Não troque provedor
  nem ative API paga ou proxy.

Confirme instalação e descoberta antes de depender de uma ferramenta.

## Skills do projeto (`.claude/skills/`, travadas em `skills-lock.json`)

- `supabase-postgres-best-practices`: antes de schema, SQL, migração, segurança ou
  performance no Postgres. Vale para qualquer Postgres; não adota Supabase nem ORM.
- `shadcn`: antes de mexer em `components.json`, tokens ou `src/components/ui`.
- `vercel-react-best-practices`, `vercel-composition-patterns`: ao escrever ou revisar
  React (ignore o que for específico de Next.js).
- `web-design-guidelines`: revisão de interface e acessibilidade.
- `writing-guidelines`: revisão de documentação e texto de tela.
- `vercel-react-view-transitions`: só quando uma transição for pedida.
- `differential-review`: revisão de diffs sensíveis a segurança.
- `find-skills`: quando faltar uma capacidade concreta.

Skill disponível não autoriza mudar arquitetura, publicar ou adicionar animação.

## Git e colaboração

- Sem bloqueio de push em `main`, exigência de branch/worktree ou hooks de Git.
- Commit e push só quando o usuário pedir.
- Antes de concluir, confirme que `.env`, segredos, dumps e artefatos gerados não
  entraram no diff.

## Delegação e revisão

- Delegue só quando isolamento de contexto, especialização ou paralelismo independente
  compensarem; tarefa simples se faz direto.
- Escolha o modelo mais leve que cumpra o critério de aceite; use mais capacidade para
  segurança, dados, migração, concorrência e revisão crítica.
- Cada tarefa delegada recebe objetivo, contexto mínimo, arquivos permitidos, recursos
  mutáveis, critério de aceite e checagens. Um escritor por arquivo; lockfile,
  configuração compartilhada e Git são do coordenador. Revisores são só leitura.
  Paralelismo segue `.claude/rules/parallel-subagent-driven-development.md`.
- Confira diff e checagens antes de aceitar o resultado de um agente.
- Revise proporcional ao risco e ao diff real. Pare quando os achados relevantes
  estiverem resolvidos ou com destino explícito e as checagens afetadas passarem.

## Convenções de implementação

- Rotas em `src/routes/`; servidor e SQL em `src/server/`; componentes não executam SQL.
- `src/server/db.ts` é o único módulo que importa `pg` ou lê URLs do banco (garantido
  por lint).

- Inspecione todos os chamadores antes de alterar helper, server function ou view.
- Prefira o padrão já instalado e o menor diff correto; não adicione dependência ou
  abstração para necessidade futura.
- Cada módulo de servidor começa com comentário explicando por que existe.
- Mapeie `snake_case` para `camelCase` explicitamente no servidor.
- Converta `numeric` do `pg` com `Number(...)` e datas para ISO string no servidor.
- Exiba datas no fuso `America/Sao_Paulo`, reutilizando `src/lib/formato.ts`.
- Faça casts SQL explícitos, por exemplo `$1::uuid`, `$1::text` e `$1::boolean`.
- Valide entrada com Zod e autorização no servidor. Botão oculto não é controle de
  acesso.
- Preserve os acessos atuais até a fase que os substituir: `/`, `/kanban`, `/wf02`,
  `/reports`, `/admin` e `/templates` são de admin; `/followups` e `/meus-leads` são
  isoladas por atendente; `/instalar` exige sessão; `/login` é pública.
- A sessão usa cookie `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` em produção; o
  banco persiste somente o SHA-256 do token.
- Antes de inserir `followup_toques`, confirme no servidor que o followup pertence à
  atendente autenticada.
- Novos módulos com `createServerFn` em `src/server/` entram em
  `importProtection.client.excludeFiles` de `vite.config.ts`; nunca exclua
  `src/server/db.ts` da proteção.
- Para `wa.me`, mantenha telefone só em dígitos e texto com `encodeURIComponent`.
  Registre o toque sem `await` e navegue com `window.location.href`; não use
  `window.open()` no fluxo instalado do iOS.
- Push no iOS exige app instalado e permissão solicitada diretamente por gesto. O
  service worker não faz cache offline de dados operacionais.
- No endpoint push, compare segredo de forma resistente a timing, responda 404 quando
  inválido, isole falhas e remova inscrições após 404/410 do provedor.
- `DATABASE_URL_RW` e `PAINEL_RW_PASSWORD` devem representar exatamente a mesma senha
  quando a role for aplicada.
- Paginação/load-more só entra quando o workspace puder carregar histórico grande; não
  carregue milhares de mensagens para resolver o primeiro card.
- Logs estruturados não incluem texto de conversa, senha, token ou segredo sem
  necessidade explícita.
