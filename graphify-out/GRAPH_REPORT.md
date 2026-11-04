# Graph Report - dash-wakeclub-crm-wpp  (2026-11-04)

## Corpus Check
- 119 files · ~68,379 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 6, .toml 1, .template 1)

## Summary
- 1240 nodes · 2401 edges · 91 communities (86 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7c3b6f25`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- wf02.tsx
- admin.tsx
- routeTree.gen.ts
- push-dispatch.ts
- utils.ts
- compilerOptions
- __root.tsx
- opportunities.ts
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
- WakeCRM · motor próprio, sem n8n
- telefone
- scripts
- command.tsx
- breadcrumb.tsx
- drawer.tsx
- navigation-menu.tsx
- sidebar.tsx
- toggle-group.tsx
- form.tsx
- package.json
- getPool
- core-rules.cjs
- Arquitetura atual do Wake Club Dashboard
- admin.ts
- WakeCRM · Wake Club
- AppSidebar.tsx
- formato.ts
- index.tsx
- Preparação local
- Design e acessibilidade
- SidebarMenuButton
- OpportunityWorkspace
- accordion.tsx
- Modelo de dados atual
- SidebarProvider
- resizable.tsx
- AppSidebar
- OpportunityWorkspace.tsx
- eslint.config.js
- @radix-ui/react-aspect-ratio
- @radix-ui/react-collapsible
- vite.config.ts
- exigirAdmin
- plan(2).md
- Botão "não atender" — especificação para o front
- AGENTS.md · WakeCRM (Wake Club)
- auth.ts
- FASE 7 — NOVA TELA DA ATENDENTE: MINHA FILA
- O QUE NÃO FAZER
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
- WakeCRM · Wake Club
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
- PERFORMANCE
- minha-fila.tsx
- Routes
- Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace
- Q: O que precisa ser feito no n8n para a Fase 3?
- avatar.tsx

## God Nodes (most connected - your core abstractions)
1. `cn()` - 256 edges
2. `react` - 55 edges
3. `lucide-react` - 32 edges
4. `exigirAdmin` - 31 edges
5. `getPool()` - 31 edges
6. `getPoolRw()` - 21 edges
7. `plural()` - 18 edges
8. `@tanstack/react-router` - 17 edges
9. `desde()` - 17 edges
10. `telefone()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `9.2 Kanban do admin` --references--> `OpportunityWorkspace()`  [INFERRED]
  docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md → src/features/opportunities/OpportunityWorkspace.tsx
- `Conversas` --references--> `OpportunityWorkspace()`  [INFERRED]
  plan(2).md → src/features/opportunities/OpportunityWorkspace.tsx
- `Critério de aceite` --references--> `OpportunityWorkspace()`  [INFERRED]
  plan(2).md → src/features/opportunities/OpportunityWorkspace.tsx
- `B2. `src/server/db.ts` — a segunda conexão` --references--> `getPool()`  [INFERRED]
  ESPEC-PAINEL-EQUIPE.md → src/server/db.ts
- `2. O que já está pronto — não refazer` --references--> `getPoolRw()`  [INFERRED]
  ESPEC-BOTAO-NAO-ATENDER.md → src/server/db.ts

## Import Cycles
- None detected.

## Communities (91 total, 5 thin omitted)

### Community 0 - "wf02.tsx"
Cohesion: 0.11
Nodes (14): plural(), InboxPage(), MeusLeadsPage(), AbaFila(), FOLLOWUP_ROTULO, LinhaDoMotor(), SITUACAO, STATUS_ESTILO (+6 more)

### Community 1 - "admin.tsx"
Cohesion: 0.09
Nodes (29): @radix-ui/react-alert-dialog, react-day-picker, src_components_ui_alert_dialog_alertdialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter() (+21 more)

### Community 2 - "routeTree.gen.ts"
Cohesion: 0.09
Nodes (24): getRouter(), Route, AdminRoute, ApiPushEnviarRoute, FileRoutesByFullPath, FileRoutesById, FileRoutesByTo, FileRouteTypes (+16 more)

### Community 3 - "push-dispatch.ts"
Cohesion: 0.15
Nodes (14): Módulos server-only, Rotas e superfícies HTTP, ref_node_crypto, web-push, payloadSchema, Route, segredoValido(), testarNotificacaoDaAtendente (+6 more)

### Community 4 - "utils.ts"
Cohesion: 0.08
Nodes (22): input-otp, @radix-ui/react-checkbox, @radix-ui/react-hover-card, @radix-ui/react-popover, @radix-ui/react-radio-group, @radix-ui/react-slider, @radix-ui/react-switch, @radix-ui/react-tooltip (+14 more)

### Community 5 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+10 more)

### Community 6 - "__root.tsx"
Cohesion: 0.14
Nodes (8): ref_styles_css_url, PwaRegistrar(), SidebarInset, Toaster(), ToasterProps, ALERTA_ESTILO, Sessao, SaudeNumero

### Community 7 - "opportunities.ts"
Cohesion: 0.22
Nodes (13): zod, getMensagens, iso(), LinhaConversa, LinhaMensagem, Mensagem, CategoriaTimeline, DadosOpportunityWorkspace (+5 more)

### Community 8 - "kanban.tsx"
Cohesion: 0.18
Nodes (9): Fronteira segura para iniciar a Fase 1, @radix-ui/react-scroll-area, src_components_ui_dialog_dialogtrigger, ScrollArea, ScrollBar, COLUNAS, FOLLOWUP_ROTULO, TEMPERATURA_ESTILO (+1 more)

### Community 9 - "templates.tsx"
Cohesion: 0.13
Nodes (13): Input, Progress, TabsContent, TabsList, TabsTrigger, Campaign, campaigns, Template (+5 more)

### Community 10 - "cn"
Cohesion: 0.09
Nodes (37): @radix-ui/react-context-menu, @radix-ui/react-dropdown-menu, @radix-ui/react-select, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem (+29 more)

### Community 11 - "reports.tsx"
Cohesion: 0.08
Nodes (26): recharts, ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, getPayloadConfigFromPayload() (+18 more)

### Community 12 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 13 - "Especificação · Painel da equipe (login, push, fila de followups, admin)"
Cohesion: 0.05
Nodes (36): 0. O contexto em cinco parágrafos, 10. Variáveis de ambiente, 11. Armadilhas conhecidas (todas já custaram tempo aqui), 12. Resumo do contrato com o n8n, 1. O que já existe (não recriar), 2. O que construir, 4. Fase B — Login e sessão, 5. Fase C — App instalável (PWA) (+28 more)

### Community 14 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 15 - "painel-db.mjs"
Cohesion: 0.09
Nodes (27): 3. Fase A — Banco, A1. A segunda role: `painel_rw`, A2. Views novas, A3. Script, ✅ Aceite da Fase A, eslint, ref_node_fs, ref_node_path (+19 more)

### Community 16 - "pagination.tsx"
Cohesion: 0.20
Nodes (9): ButtonProps, Pagination(), PaginationContent, PaginationEllipsis(), PaginationItem, PaginationLink(), PaginationLinkProps, PaginationNext() (+1 more)

### Community 17 - "server.ts"
Cohesion: 0.25
Nodes (8): consumeLastCapturedError(), renderErrorPage(), fetch(), getServerEntry(), isH3SwallowedErrorBody(), normalizeCatastrophicSsrResponse(), ServerEntry, errorMiddleware

### Community 18 - "carousel.tsx"
Cohesion: 0.17
Nodes (14): embla-carousel-react, Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext (+6 more)

### Community 19 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, eslint, eslint-config-prettier, eslint-import-resolver-typescript, @eslint/js, eslint-plugin-import-x, eslint-plugin-prettier, eslint-plugin-react-hooks (+15 more)

### Community 20 - "dependencies"
Cohesion: 0.04
Nodes (55): dependencies, bcryptjs, class-variance-authority, clsx, cmdk, date-fns, embla-carousel-react, @hookform/resolvers (+47 more)

### Community 21 - "WakeCRM · motor próprio, sem n8n"
Cohesion: 0.06
Nodes (36): 10. Fases, 11. Pendências que dependem de dado real, 12. Deixado para o construtor, 1. Intenção, 3. Objetivos, não-objetivos, anti-objetivos, 4.1 Fila de entrada (webhooks), 4.2 Tarefas agendadas, 4.3 Evolution Go (+28 more)

### Community 22 - "telefone"
Cohesion: 0.27
Nodes (12): Base existente — não recriar, Componentes e comportamentos reutilizáveis, Evento(), dataHoraCompleta(), iniciais(), telefone(), ItemDaLista(), Thread() (+4 more)

### Community 23 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, build:dev, check, db:apply, db:check, dev, format (+7 more)

### Community 24 - "command.tsx"
Cohesion: 0.10
Nodes (19): cmdk, @radix-ui/react-dialog, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList (+11 more)

### Community 25 - "breadcrumb.tsx"
Cohesion: 0.22
Nodes (8): @radix-ui/react-slot, Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 26 - "drawer.tsx"
Cohesion: 0.22
Nodes (7): vaul, DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 27 - "navigation-menu.tsx"
Cohesion: 0.25
Nodes (8): @radix-ui/react-navigation-menu, NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 28 - "sidebar.tsx"
Cohesion: 0.11
Nodes (17): @radix-ui/react-separator, Separator, SidebarContext, SidebarContextProps, SidebarGroupAction, SidebarInput, SidebarMenuAction, SidebarMenuBadge (+9 more)

### Community 29 - "toggle-group.tsx"
Cohesion: 0.31
Nodes (7): @radix-ui/react-toggle, @radix-ui/react-toggle-group, ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 30 - "form.tsx"
Cohesion: 0.13
Nodes (18): @radix-ui/react-label, react-hook-form, Alert, AlertDescription, AlertTitle, alertVariants, FormControl, FormDescription (+10 more)

### Community 31 - "package.json"
Cohesion: 0.08
Nodes (25): name, private, sideEffects, type, clsx, date-fns, eslint-config-prettier, @hookform/resolvers (+17 more)

### Community 32 - "getPool"
Cohesion: 0.19
Nodes (16): @tanstack/react-start, createPool(), getPool(), LinhaLead, LinhaMensagem, listarMensagensDoMeuLead, MensagemDoMeuLead, inscricaoSchema (+8 more)

### Community 33 - "core-rules.cjs"
Cohesion: 0.19
Nodes (13): {
  BANNED_CONSOLE_METHODS,
  DEFAULT_MAX_LINES,
  fileName,
  isBaselineIgnored,
  isCheckableSourceFile,
  isTestFile,
}, maxLines, noDirectConsole, noDirectDataAccess, {
  maxLines,
  noDirectConsole,
  noDirectDataAccess,
}, BANNED_CONSOLE_METHODS, eslint_rules_utils_default_max_lines, fileName() (+5 more)

### Community 34 - "Arquitetura atual do Wake Club Dashboard"
Cohesion: 0.12
Nodes (16): Arquitetura atual do Wake Club Dashboard, Base existente e regras vigentes do painel, Contexto do sistema, Estado validado nesta Fase 0, Fluxo de uma conversa até a ação humana, Lacunas em relação ao plano de refatoração, Organização do código, `painel_ro` (+8 more)

### Community 35 - "admin.ts"
Cohesion: 0.20
Nodes (12): 5. Armadilhas que já custaram tempo neste repositório, alterarAtendente, alterarAtendenteSchema, AparelhoAdmin, criarAtendenteSchema, getPainelAdmin, iso(), numeroOuNulo() (+4 more)

### Community 36 - "WakeCRM · Wake Club"
Cohesion: 0.20
Nodes (10): Fluxos que existem hoje, Fora de escopo, Manutenção, Pendências, Problema e objetivo, Próxima entrega (WakeCRM, planejado, não implementado), Público e papéis, Requisitos permanentes (+2 more)

### Community 37 - "AppSidebar.tsx"
Cohesion: 0.20
Nodes (9): navAdmin, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu (+1 more)

### Community 38 - "formato.ts"
Cohesion: 0.33
Nodes (8): dataHora(), desde(), hora(), FollowupCard(), DetalhesDoLead(), CardDoLead(), Conversa(), FilaCard()

### Community 39 - "index.tsx"
Cohesion: 0.14
Nodes (11): 2. Esta decisão substitui regras anteriores, src_components_ui_sheet_sheet, src_components_ui_tabs_tabs, diaRelativo(), Bolha(), Campo(), Filtro, FOLLOWUP_ROTULO (+3 more)

### Community 41 - "Preparação local"
Cohesion: 0.29
Nodes (7): Agentes, Banco, Preparação local, Primeira execução, Problemas conhecidos, Pré-requisitos, Verificar

### Community 42 - "Design e acessibilidade"
Cohesion: 0.33
Nodes (5): Design e acessibilidade, Direção, Interação, Manutenção, Sistema existente

### Community 43 - "SidebarMenuButton"
Cohesion: 0.33
Nodes (6): Sidebar, SidebarMenuButton, sidebarMenuButtonVariants, SidebarRail, SidebarTrigger, useSidebar()

### Community 44 - "OpportunityWorkspace"
Cohesion: 0.50
Nodes (5): Histórico da refatoração por oportunidades, Leitura prática das fases, Mandato atual, Produto que estamos construindo, OpportunityWorkspace()

### Community 45 - "accordion.tsx"
Cohesion: 0.40
Nodes (4): @radix-ui/react-accordion, AccordionContent, AccordionItem, AccordionTrigger

### Community 46 - "Modelo de dados atual"
Cohesion: 0.50
Nodes (4): Entidades da equipe, Entidades do CRM, Modelo de dados atual, Relações principais

### Community 47 - "SidebarProvider"
Cohesion: 0.50
Nodes (3): Layout e revisão, SidebarProvider, useIsMobile()

### Community 48 - "resizable.tsx"
Cohesion: 0.50
Nodes (3): react-resizable-panels, ResizableHandle(), ResizablePanelGroup()

### Community 49 - "AppSidebar"
Cohesion: 0.67
Nodes (3): B6. Cabeçalho, AppSidebar(), encerrarSessao()

### Community 89 - "OpportunityWorkspace.tsx"
Cohesion: 0.16
Nodes (11): DialogContent, DialogDescription, DialogFooter(), DialogHeader(), DialogOverlay, DialogTitle, FILTROS, FOLLOWUP_ROTULO (+3 more)

### Community 96 - "eslint.config.js"
Cohesion: 0.17
Nodes (10): camadasUi, testFiles, eslint-import-resolver-typescript, @eslint/js, eslint-plugin-import-x, eslint-plugin-prettier, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+2 more)

### Community 100 - "vite.config.ts"
Cohesion: 0.40
Nodes (4): nitro, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 102 - "exigirAdmin"
Cohesion: 0.27
Nodes (12): Route, Route, Route, Route, Route, Route, FileRoutesByPath, exigirAdmin (+4 more)

### Community 103 - "plan(2).md"
Cohesion: 0.08
Nodes (23): Administrador, Administrador, Atendente, Backend, COMPATIBILIDADE, DEFINIÇÃO DE PRONTO — PRODUTO, Estrutura sugerida, Exemplo (+15 more)

### Community 104 - "Botão "não atender" — especificação para o front"
Cohesion: 0.15
Nodes (12): 0. Por que este botão existe, 1. A regra que este botão não pode quebrar, 2. O que já está pronto — não refazer, 3.1 Server function — em `src/server/leads.ts`, 3.2 Expor o estado na listagem, 3.3 O botão, 3. O que construir, 4. O que marcar de fato faz — e o que não faz (+4 more)

### Community 105 - "AGENTS.md · WakeCRM (Wake Club)"
Cohesion: 0.18
Nodes (11): Acordos de trabalho, AGENTS.md · WakeCRM (Wake Club), Comandos canônicos, Continuidade, Convenções de implementação, Delegação e revisão, Ferramentas e estilo, Git e colaboração (+3 more)

### Community 106 - "auth.ts"
Cohesion: 0.22
Nodes (14): bcryptjs, LoginPage(), enviar(), Route, criarAtendente, cookieSeguro(), entrar, estaBloqueado() (+6 more)

### Community 107 - "FASE 7 — NOVA TELA DA ATENDENTE: MINHA FILA"
Cohesion: 0.20
Nodes (10): Card sugerido, Critério de aceite, Esperando resposta, FASE 7 — NOVA TELA DA ATENDENTE: MINHA FILA, Feitos hoje, Mais tarde, Nova página, Objetivo (+2 more)

### Community 108 - "O QUE NÃO FAZER"
Cohesion: 0.20
Nodes (10): Não adicionar drag-and-drop antes de resolver a fonte de verdade da etapa., Não armazenar chain-of-thought de IA., Não considerar "abriu WhatsApp" como "enviou mensagem"., Não considerar followup cancelado automaticamente como erro., Não criar dashboards cheios de números sem ação correspondente., Não criar nova implementação de conversa para cada tela., Não esconder o motivo de decisões automáticas., Não refatorar banco inteiro antes de validar a nova UX. (+2 more)

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

### Community 120 - "WakeCRM · Wake Club"
Cohesion: 0.25
Nodes (8): Configuração local, Desenvolvimento, Documentação, Imagem Docker, Próxima entrega, Qualidade e build, Requisitos, WakeCRM · Wake Club

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

### Community 137 - "PERFORMANCE"
Cohesion: 0.50
Nodes (4): OpportunityWorkspace, PERFORMANCE, Timeline, Índices

### Community 140 - "minha-fila.tsx"
Cohesion: 0.06
Nodes (56): ref_bun_test, class-variance-authority, lucide-react, sonner, @tanstack/react-query, @tanstack/react-router, Badge(), BadgeProps (+48 more)

### Community 145 - "Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace, Source Nodes

### Community 146 - "Q: O que precisa ser feito no n8n para a Fase 3?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: O que precisa ser feito no n8n para a Fase 3?, Source Nodes

### Community 149 - "avatar.tsx"
Cohesion: 0.40
Nodes (4): @radix-ui/react-avatar, Avatar, AvatarFallback, AvatarImage

## Knowledge Gaps
- **521 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `css` (+516 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 597 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

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

- **Why does `cn()` connect `cn` to `wf02.tsx`, `admin.tsx`, `utils.ts`, `__root.tsx`, `kanban.tsx`, `templates.tsx`, `reports.tsx`, `minha-fila.tsx`, `menubar.tsx`, `pagination.tsx`, `carousel.tsx`, `avatar.tsx`, `telefone`, `command.tsx`, `breadcrumb.tsx`, `drawer.tsx`, `navigation-menu.tsx`, `sidebar.tsx`, `toggle-group.tsx`, `form.tsx`, `AppSidebar.tsx`, `formato.ts`, `index.tsx`, `SidebarMenuButton`, `OpportunityWorkspace`, `accordion.tsx`, `SidebarProvider`, `resizable.tsx`, `OpportunityWorkspace.tsx`?**
  _High betweenness centrality (0.287) - this node is a cross-community bridge._
- **Why does `OpportunityWorkspace()` connect `OpportunityWorkspace` to `FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE`, `formato.ts`, `index.tsx`, `opportunities.ts`, `kanban.tsx`, `cn`, `Avaliar remoção da navegação principal`, `WakeCRM · motor próprio, sem n8n`, `telefone`, `OpportunityWorkspace.tsx`?**
  _High betweenness centrality (0.255) - this node is a cross-community bridge._
- **Why does `Critério de aceite` connect `FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE` to `OpportunityWorkspace`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _521 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `wf02.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10952380952380952 - nodes in this community are weakly interconnected._
- **Should `admin.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08912655971479501 - nodes in this community are weakly interconnected._
- **Should `routeTree.gen.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09230769230769231 - nodes in this community are weakly interconnected._