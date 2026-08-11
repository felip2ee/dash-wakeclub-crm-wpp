# Graph Report - dashboard  (2026-08-11)

## Corpus Check
- 118 files · ~70,376 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1170 nodes · 2045 edges · 151 communities (86 shown, 65 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `380747b3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- wf02.tsx
- admin.tsx
- routeTree.gen.ts
- getPoolRw
- utils.ts
- compilerOptions
- sidebar.tsx
- exigirAdmin
- kanban.tsx
- templates.tsx
- cn
- reports.tsx
- components.json
- Especificação · Painel da equipe (login, push, fila de followups, admin)
- menubar.tsx
- painel-db.mjs
- pagination.tsx
- server.ts
- carousel.tsx
- devDependencies
- dependencies
- chart.tsx
- desde
- scripts
- command.tsx
- breadcrumb.tsx
- drawer.tsx
- navigation-menu.tsx
- What You Must Do When Invoked
- toggle-group.tsx
- form.tsx
- package.json
- getPool
- Arquitetura atual do Wake Club Dashboard
- class-variance-authority
- clsx
- cmdk
- date-fns
- embla-carousel-react
- index.tsx
- eslint-plugin-prettier
- globals
- @hookform/resolvers
- nitro
- pg
- @radix-ui/react-accordion
- @radix-ui/react-alert-dialog
- @radix-ui/react-avatar
- @radix-ui/react-checkbox
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-hover-card
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-popover
- @radix-ui/react-progress
- @radix-ui/react-radio-group
- @radix-ui/react-scroll-area
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-slider
- @radix-ui/react-slot
- @radix-ui/react-switch
- @radix-ui/react-tabs
- @radix-ui/react-toggle
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- react
- react-day-picker
- react-dom
- react-resizable-panels
- recharts
- sonner
- tailwind-merge
- tailwindcss
- @tanstack/react-query
- @tanstack/react-router
- @tanstack/react-start
- @tanstack/router-plugin
- tw-animate-css
- vaul
- web-push
- zod
- prettier
- @types/bcryptjs
- @types/node
- OpportunityWorkspace.tsx
- @types/react
- @types/react-dom
- @types/web-push
- select.tsx
- @vitejs/plugin-react
- conversas.ts
- plan(2).md
- Botão "não atender" — especificação para o front
- AGENTS.md · Refatoração do CRM Wake Club
- auth.ts
- FASE 7 — NOVA TELA DA ATENDENTE: MINHA FILA
- O QUE NÃO FAZER
- graphify reference: extra exports and benchmark
- FASE 5 — CENTRAL ADMINISTRATIVA
- FASE 3 — CRIAR AUDITORIA DAS IAs
- FASE 1 — CRIAR O OPPORTUNITY WORKSPACE
- Indicadores
- FASE 4 — TIMELINE UNIFICADA REAL
- Q: Como implementar a Fase 1 OpportunityWorkspace reutilizando os dados atuais?
- Avaliar remoção da navegação principal
- FASE 6 — CENTRALIZAR MÉTRICAS
- FASE 8 — FEEDBACK DO FOLLOWUP APÓS VOLTAR DO WHATSAPP
- REGRAS DE UX
- Wake Club Dashboard
- graphify reference: query, path, explain
- FASE 9 — TABELA FOLLOWUP_FEEDBACK
- FASE 10 — CICLO DE VIDA DO FOLLOWUP
- FASE 13 — SEPARAR CONTATO DE OPORTUNIDADE
- Q: Analisar o contexto geral do app para iniciar a refatoração do plan(2).md pela Fase 0
- Q: Ligar o megabrain e comecar as operacoes da refatoracao pela Fase 0
- PRINCÍPIOS DA REFATORAÇÃO
- FASE 14 — DESACOPLAR ETAPA DO CRM DA ETIQUETA DO WHATSAPP
- Navegação administrativa
- FASE 0 — MAPEAR O ESTADO ATUAL
- FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE
- Q: vamos fazer a fase 7
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- FASE 12 — COMPONENTIZAÇÃO DO FRONTEND
- PERFORMANCE
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- minha-fila.tsx
- @types/pg
- Routes
- extraction-spec.md
- eslint-config-prettier
- Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace
- Q: O que precisa ser feito no n8n para a Fase 3?
- alert.tsx
- input-otp.tsx
- avatar.tsx
- @eslint/js

## God Nodes (most connected - your core abstractions)
1. `cn()` - 256 edges
2. `exigirAdmin` - 31 edges
3. `getPool()` - 27 edges
4. `plural()` - 18 edges
5. `desde()` - 17 edges
6. `telefone()` - 17 edges
7. `getPoolRw()` - 17 edges
8. `compilerOptions` - 17 edges
9. `Button` - 15 edges
10. `Arquitetura atual do Wake Club Dashboard` - 15 edges

## Surprising Connections (you probably didn't know these)
- `AlertDialogOverlay` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert-dialog.tsx → src/lib/utils.ts
- `AlertTitle` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert.tsx → src/lib/utils.ts
- `AvatarImage` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/avatar.tsx → src/lib/utils.ts
- `BreadcrumbList` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/breadcrumb.tsx → src/lib/utils.ts
- `BreadcrumbItem` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/breadcrumb.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (151 total, 65 thin omitted)

### Community 0 - "wf02.tsx"
Cohesion: 0.10
Nodes (14): plural(), InboxPage(), MeusLeadsPage(), AbaFila(), FOLLOWUP_ROTULO, LinhaDoMotor(), SITUACAO, STATUS_ESTILO (+6 more)

### Community 1 - "admin.tsx"
Cohesion: 0.09
Nodes (33): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay, AlertDialogTitle (+25 more)

### Community 2 - "routeTree.gen.ts"
Cohesion: 0.09
Nodes (29): getRouter(), Route, Route, Route, Route, Route, AdminRoute, ApiPushEnviarRoute (+21 more)

### Community 3 - "getPoolRw"
Cohesion: 0.24
Nodes (11): payloadSchema, Route, segredoValido(), testarNotificacaoDaAtendente, getPoolRw(), entregarPush(), Inscricao, mensagemDoErro() (+3 more)

### Community 4 - "utils.ts"
Cohesion: 0.09
Nodes (12): Checkbox, HoverCardContent, PopoverContent, RadioGroup, RadioGroupItem, ResizableHandle(), ResizablePanelGroup(), Skeleton() (+4 more)

### Community 5 - "compilerOptions"
Cohesion: 0.07
Nodes (26): DOM, DOM.Iterable, ES2022, eslint.config.js, src/**/*.ts, src/**/*.tsx, vite/client, vite.config.ts (+18 more)

### Community 6 - "sidebar.tsx"
Cohesion: 0.05
Nodes (48): AppSidebar(), navAdmin, PwaRegistrar(), Separator, SheetContent, SheetContentProps, SheetDescription, SheetFooter() (+40 more)

### Community 7 - "exigirAdmin"
Cohesion: 0.26
Nodes (16): Route, exigirAdmin, getMensagens, Mensagem, CategoriaTimeline, DadosOpportunityWorkspace, EventoBase, getOpportunityWorkspace (+8 more)

### Community 8 - "kanban.tsx"
Cohesion: 0.28
Nodes (5): ScrollArea, ScrollBar, COLUNAS, FOLLOWUP_ROTULO, TEMPERATURA_ESTILO

### Community 9 - "templates.tsx"
Cohesion: 0.15
Nodes (12): Progress, TabsContent, TabsList, TabsTrigger, Campaign, campaigns, Template, templates (+4 more)

### Community 10 - "cn"
Cohesion: 0.11
Nodes (31): AccordionContent, AccordionItem, AccordionTrigger, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem (+23 more)

### Community 11 - "reports.tsx"
Cohesion: 0.12
Nodes (16): diaCurto(), EIXO, KPI(), Painel(), ReportsPage(), SERIE, somar(), Termometro() (+8 more)

### Community 12 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 13 - "Especificação · Painel da equipe (login, push, fila de followups, admin)"
Cohesion: 0.05
Nodes (42): 0. O contexto em cinco parágrafos, 10. Variáveis de ambiente, 11. Armadilhas conhecidas (todas já custaram tempo aqui), 12. Resumo do contrato com o n8n, 1. O que já existe (não recriar), 2. O que construir, 3. Fase A — Banco, 4. Fase B — Login e sessão (+34 more)

### Community 14 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 15 - "painel-db.mjs"
Cohesion: 0.22
Nodes (14): apply(), AQUI, check(), conectar(), cor, diagnosticarConexao(), exigir(), linha() (+6 more)

### Community 16 - "pagination.tsx"
Cohesion: 0.20
Nodes (9): ButtonProps, Pagination(), PaginationContent, PaginationEllipsis(), PaginationItem, PaginationLink(), PaginationLinkProps, PaginationNext() (+1 more)

### Community 17 - "server.ts"
Cohesion: 0.25
Nodes (8): consumeLastCapturedError(), renderErrorPage(), fetch(), getServerEntry(), isH3SwallowedErrorBody(), normalizeCatastrophicSsrResponse(), ServerEntry, errorMiddleware

### Community 18 - "carousel.tsx"
Cohesion: 0.19
Nodes (13): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+5 more)

### Community 19 - "devDependencies"
Cohesion: 0.15
Nodes (13): eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, devDependencies, eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, typescript (+5 more)

### Community 20 - "dependencies"
Cohesion: 0.15
Nodes (13): input-otp, lucide-react, dependencies, bcryptjs, input-otp, lucide-react, @radix-ui/react-aspect-ratio, react-hook-form (+5 more)

### Community 21 - "chart.tsx"
Cohesion: 0.25
Nodes (9): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, getPayloadConfigFromPayload(), THEMES (+1 more)

### Community 22 - "desde"
Cohesion: 0.23
Nodes (16): Evento(), OpportunityWorkspace(), dataHora(), dataHoraCompleta(), desde(), iniciais(), telefone(), FollowupCard() (+8 more)

### Community 23 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, build:dev, db:apply, db:check, dev, format, lint (+2 more)

### Community 24 - "command.tsx"
Cohesion: 0.15
Nodes (11): Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut() (+3 more)

### Community 25 - "breadcrumb.tsx"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 26 - "drawer.tsx"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 27 - "navigation-menu.tsx"
Cohesion: 0.29
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 28 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 29 - "toggle-group.tsx"
Cohesion: 0.43
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 30 - "form.tsx"
Cohesion: 0.19
Nodes (12): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+4 more)

### Community 31 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, sideEffects, type

### Community 32 - "getPool"
Cohesion: 0.17
Nodes (13): Route, Route, createPool(), getPool(), getLeadsPainel, iso(), LeadCard, Row (+5 more)

### Community 33 - "Arquitetura atual do Wake Club Dashboard"
Cohesion: 0.09
Nodes (21): Arquitetura atual do Wake Club Dashboard, Componentes e comportamentos reutilizáveis, Contexto do sistema, Entidades da equipe, Entidades do CRM, Estado validado nesta Fase 0, Fluxo de uma conversa até a ação humana, Fronteira segura para iniciar a Fase 1 (+13 more)

### Community 39 - "index.tsx"
Cohesion: 0.21
Nodes (9): Input, diaRelativo(), hora(), Bolha(), Filtro, FOLLOWUP_ROTULO, TEMPERATURA_ESTILO, Conversa() (+1 more)

### Community 89 - "OpportunityWorkspace.tsx"
Cohesion: 0.14
Nodes (11): Badge(), BadgeProps, badgeVariants, DialogDescription, DialogHeader(), DialogTitle, FILTROS, FOLLOWUP_ROTULO (+3 more)

### Community 93 - "select.tsx"
Cohesion: 0.25
Nodes (7): SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger

### Community 102 - "conversas.ts"
Cohesion: 0.29
Nodes (7): Route, Conversa, Direcao, getConversas, iso(), LinhaConversa, LinhaMensagem

### Community 103 - "plan(2).md"
Cohesion: 0.10
Nodes (19): Administrador, Administrador, Atendente, Backend, COMPATIBILIDADE, DEFINIÇÃO DE PRONTO — PRODUTO, Exemplo, Frontend (+11 more)

### Community 104 - "Botão "não atender" — especificação para o front"
Cohesion: 0.14
Nodes (13): 0. Por que este botão existe, 1. A regra que este botão não pode quebrar, 2. O que já está pronto — não refazer, 3.1 Server function — em `src/server/leads.ts`, 3.2 Expor o estado na listagem, 3.3 O botão, 3. O que construir, 4. O que marcar de fato faz — e o que não faz (+5 more)

### Community 105 - "AGENTS.md · Refatoração do CRM Wake Club"
Cohesion: 0.15
Nodes (12): AGENTS.md · Refatoração do CRM Wake Club, Base existente — não recriar, Comandos e validação, Convenções de implementação, Fluxo obrigatório de trabalho, Fontes de verdade, Graphify, Leitura prática das fases (+4 more)

### Community 106 - "auth.ts"
Cohesion: 0.33
Nodes (10): LoginPage(), cookieSeguro(), entrar, estaBloqueado(), getSessao, hashToken(), Papel, registrarFalha() (+2 more)

### Community 107 - "FASE 7 — NOVA TELA DA ATENDENTE: MINHA FILA"
Cohesion: 0.20
Nodes (10): Card sugerido, Critério de aceite, Esperando resposta, FASE 7 — NOVA TELA DA ATENDENTE: MINHA FILA, Feitos hoje, Mais tarde, Nova página, Objetivo (+2 more)

### Community 108 - "O QUE NÃO FAZER"
Cohesion: 0.20
Nodes (10): Não adicionar drag-and-drop antes de resolver a fonte de verdade da etapa., Não armazenar chain-of-thought de IA., Não considerar "abriu WhatsApp" como "enviou mensagem"., Não considerar followup cancelado automaticamente como erro., Não criar dashboards cheios de números sem ação correspondente., Não criar nova implementação de conversa para cada tela., Não esconder o motivo de decisões automáticas., Não refatorar banco inteiro antes de validar a nova UX. (+2 more)

### Community 109 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 110 - "FASE 5 — CENTRAL ADMINISTRATIVA"
Cohesion: 0.22
Nodes (9): 1. Cabeçalho, 2. Métricas operacionais, 3. Filtros do Kanban, 4. Kanban, Critério de aceite, Estrutura, FASE 5 — CENTRAL ADMINISTRATIVA, Métricas clicáveis (+1 more)

### Community 111 - "FASE 3 — CRIAR AUDITORIA DAS IAs"
Cohesion: 0.22
Nodes (9): agent_key, Critério de aceite, Estrutura sugerida, event_type, Exemplo, FASE 3 — CRIAR AUDITORIA DAS IAs, Importante, Objetivo (+1 more)

### Community 112 - "FASE 1 — CRIAR O OPPORTUNITY WORKSPACE"
Cohesion: 0.22
Nodes (9): Cabeçalho, Componentes sugeridos, Critérios de aceite, FASE 1 — CRIAR O OPPORTUNITY WORKSPACE, Filtros, Nova experiência, Objetivo, Resumo operacional (+1 more)

### Community 113 - "Indicadores"
Cohesion: 0.22
Nodes (9): Critério de aceite, FASE 11 — MÉTRICAS DE QUALIDADE DA IA, Indicadores, Objetivo, Por agente, Por ação, Por tipo, Principais problemas (+1 more)

### Community 114 - "FASE 4 — TIMELINE UNIFICADA REAL"
Cohesion: 0.22
Nodes (9): Critério de aceite, Equipe, Exemplo, FASE 4 — TIMELINE UNIFICADA REAL, IA, Mensagem do lead, Objetivo, Sistema (+1 more)

### Community 115 - "Q: Como implementar a Fase 1 OpportunityWorkspace reutilizando os dados atuais?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Como implementar a Fase 1 OpportunityWorkspace reutilizando os dados atuais?, Source Nodes

### Community 116 - "Avaliar remoção da navegação principal"
Cohesion: 0.29
Nodes (7): Admin antigo, Avaliar remoção da navegação principal, Conversas, FASE 15 — LIMPEZA DE NAVEGAÇÃO, IA e Followups, Relatórios, Todos os Leads

### Community 117 - "FASE 6 — CENTRALIZAR MÉTRICAS"
Cohesion: 0.29
Nodes (7): Critério de aceite, FASE 6 — CENTRALIZAR MÉTRICAS, Não transformar a home em dashboard excessivo, Nível 1 — operação agora, Nível 2 — desempenho, Objetivo, Períodos

### Community 118 - "FASE 8 — FEEDBACK DO FOLLOWUP APÓS VOLTAR DO WHATSAPP"
Cohesion: 0.29
Nodes (7): Detectar retorno, FASE 8 — FEEDBACK DO FOLLOWUP APÓS VOLTAR DO WHATSAPP, Fluxo, Objetivo, Persistência temporária, Popup, Segunda pergunta

### Community 119 - "REGRAS DE UX"
Cohesion: 0.29
Nodes (7): Regra 1, Regra 2, Regra 3, Regra 4, Regra 5, Regra 6, REGRAS DE UX

### Community 120 - "Wake Club Dashboard"
Cohesion: 0.29
Nodes (6): Configuração local, Desenvolvimento, Imagem Docker, Qualidade e build, Requisitos, Wake Club Dashboard

### Community 121 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 122 - "FASE 9 — TABELA FOLLOWUP_FEEDBACK"
Cohesion: 0.33
Nodes (6): action_taken, coherence, Estrutura sugerida, FASE 9 — TABELA FOLLOWUP_FEEDBACK, Importante, reason

### Community 123 - "FASE 10 — CICLO DE VIDA DO FOLLOWUP"
Cohesion: 0.33
Nodes (6): Cancelamentos, Componente sugerido, Eventos possíveis, Exemplo, FASE 10 — CICLO DE VIDA DO FOLLOWUP, Objetivo

### Community 124 - "FASE 13 — SEPARAR CONTATO DE OPORTUNIDADE"
Cohesion: 0.33
Nodes (6): Estratégia de migração, Exemplo, FASE 13 — SEPARAR CONTATO DE OPORTUNIDADE, Modelo futuro, Não executar antes das fases anteriores estarem estáveis., Problema

### Community 125 - "Q: Analisar o contexto geral do app para iniciar a refatoração do plan(2).md pela Fase 0"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Analisar o contexto geral do app para iniciar a refatoração do plan(2).md pela Fase 0, Source Nodes

### Community 126 - "Q: Ligar o megabrain e comecar as operacoes da refatoracao pela Fase 0"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Ligar o megabrain e comecar as operacoes da refatoracao pela Fase 0, Source Nodes

### Community 127 - "PRINCÍPIOS DA REFATORAÇÃO"
Cohesion: 0.40
Nodes (5): 1. A oportunidade é o centro do produto, 2. Não fazer uma refatoração big-bang, 3. Diferenciar estado operacional de auditoria, 4. Métricas devem funcionar como controles, PRINCÍPIOS DA REFATORAÇÃO

### Community 128 - "FASE 14 — DESACOPLAR ETAPA DO CRM DA ETIQUETA DO WHATSAPP"
Cohesion: 0.40
Nodes (5): Benefício, FASE 14 — DESACOPLAR ETAPA DO CRM DA ETIQUETA DO WHATSAPP, Fluxo futuro, Objetivo, Problema

### Community 129 - "Navegação administrativa"
Cohesion: 0.40
Nodes (5): Central, Equipe, ESTADO FINAL DESEJADO, Inteligência, Navegação administrativa

### Community 130 - "FASE 0 — MAPEAR O ESTADO ATUAL"
Cohesion: 0.40
Nodes (5): Critério de aceite, Entregável, FASE 0 — MAPEAR O ESTADO ATUAL, Objetivo, Tarefas

### Community 131 - "FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE"
Cohesion: 0.40
Nodes (5): Critério de aceite, FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE, Objetivo, Resposta sugerida, Timeline

### Community 132 - "Q: vamos fazer a fase 7"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: vamos fazer a fase 7, Source Nodes

### Community 133 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 134 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 135 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 136 - "FASE 12 — COMPONENTIZAÇÃO DO FRONTEND"
Cohesion: 0.50
Nodes (4): Estrutura sugerida, FASE 12 — COMPONENTIZAÇÃO DO FRONTEND, Problema, Regra

### Community 137 - "PERFORMANCE"
Cohesion: 0.50
Nodes (4): OpportunityWorkspace, PERFORMANCE, Timeline, Índices

### Community 140 - "minha-fila.tsx"
Cohesion: 0.08
Nodes (40): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, classificar(), diaEmSaoPaulo() (+32 more)

### Community 145 - "Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace, Source Nodes

### Community 146 - "Q: O que precisa ser feito no n8n para a Fase 3?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: O que precisa ser feito no n8n para a Fase 3?, Source Nodes

### Community 147 - "alert.tsx"
Cohesion: 0.50
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 148 - "input-otp.tsx"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 149 - "avatar.tsx"
Cohesion: 0.50
Nodes (3): Avatar, AvatarFallback, AvatarImage

## Knowledge Gaps
- **495 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `css` (+490 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **65 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `OpportunityWorkspace()` (2× useful, score=1.99344972)
- `AdminPage()` (2× useful, score=1.991127676)
- `FollowupsPage()` (2× useful, score=1.991127676)
- `getPainelAdmin` (2× useful, score=1.991127676) _(code changed — re-verify)_
- `getMensagens` (2× useful, score=1.991127676)
- `listarMinhaFila` (2× useful, score=1.991127676) _(code changed — re-verify)_

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `wf02.tsx`, `admin.tsx`, `utils.ts`, `sidebar.tsx`, `kanban.tsx`, `templates.tsx`, `reports.tsx`, `minha-fila.tsx`, `menubar.tsx`, `pagination.tsx`, `carousel.tsx`, `alert.tsx`, `input-otp.tsx`, `avatar.tsx`, `chart.tsx`, `desde`, `command.tsx`, `breadcrumb.tsx`, `drawer.tsx`, `navigation-menu.tsx`, `toggle-group.tsx`, `form.tsx`, `index.tsx`, `OpportunityWorkspace.tsx`, `select.tsx`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`, `class-variance-authority`, `clsx`, `cmdk`, `date-fns`, `embla-carousel-react`, `@hookform/resolvers`, `pg`, `@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-avatar`, `@radix-ui/react-checkbox`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `react`, `react-day-picker`, `react-dom`, `react-resizable-panels`, `recharts`, `sonner`, `tailwind-merge`, `tailwindcss`, `@tanstack/react-query`, `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/router-plugin`, `tw-animate-css`, `vaul`, `web-push`, `zod`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `eslint-plugin-prettier`, `globals`, `@types/react-dom`, `nitro`, `@types/pg`, `eslint-config-prettier`, `@eslint/js`, `prettier`, `@types/bcryptjs`, `@types/react`, `@types/node`, `@types/web-push`, `@vitejs/plugin-react`, `package.json`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _495 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `wf02.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1038961038961039 - nodes in this community are weakly interconnected._
- **Should `admin.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09230769230769231 - nodes in this community are weakly interconnected._
- **Should `routeTree.gen.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08602150537634409 - nodes in this community are weakly interconnected._