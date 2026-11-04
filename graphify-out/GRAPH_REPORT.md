# Graph Report - dash-wakeclub-crm-wpp  (2026-11-04)

## Corpus Check
- 182 files · ~114,655 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 6, .toml 1, .template 1)

## Summary
- 1500 nodes · 3210 edges · 92 communities (85 shown, 7 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 127 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0f375634`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- wf02.tsx
- button.tsx
- routeTree.gen.ts
- db.ts
- lucide-react
- compilerOptions
- __root.tsx
- exigirAdmin
- kanban.tsx
- react
- cn
- reports.tsx
- components.json
- Especificação · Painel da equipe (login, push, fila de followups, admin)
- templates.tsx
- painel-db.mjs
- iniciar.ts
- server.ts
- carousel.tsx
- devDependencies
- dependencies
- WakeCRM · motor próprio, sem n8n
- index.tsx
- scripts
- command.tsx
- getPoolMotor
- ingestao.ts
- navigation-menu.tsx
- sidebar.tsx
- Review Focus
- form.tsx
- package.json
- getPool
- core-rules.cjs
- Arquitetura atual do Wake Club Dashboard
- admin.ts
- WakeCRM · Wake Club
- minha-fila.tsx
- envio.ts
- migrar.mjs
- select.tsx
- Preparação local
- README.md
- receber.ts
- distribuicao.ts
- minha-fila/fila.ts
- Qualidade
- Setup do toolkit e evidência
- Runbook da virada para o motor próprio
- n8n-legado/README.md
- banco-teste.sh
- test-db.sh
- admin.tsx
- eslint.config.js
- @radix-ui/react-aspect-ratio
- @radix-ui/react-collapsible
- vite.config.ts
- leads.ts
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
- instalar.tsx
- Routes
- Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace
- Q: O que precisa ser feito no n8n para a Fase 3?

## God Nodes (most connected - your core abstractions)
1. `cn()` - 251 edges
2. `react` - 57 edges
3. `getPoolMotor()` - 48 edges
4. `exigirAdmin` - 41 edges
5. `getPool()` - 34 edges
6. `lucide-react` - 33 edges
7. `getPoolRw()` - 31 edges
8. `comTransacao()` - 25 edges
9. `@tanstack/react-router` - 20 edges
10. `telefone()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Imagem Docker` --references--> `main()`  [INFERRED]
  README.md → scripts/migrar.mjs
- `Comandos` --references--> `check()`  [INFERRED]
  docs/quality.md → scripts/painel-db.mjs
- `Lint tipado` --references--> `check()`  [INFERRED]
  docs/quality.md → scripts/painel-db.mjs
- `Memória e evidência do harness` --references--> `check()`  [INFERRED]
  docs/setup.md → scripts/painel-db.mjs
- `Pendências e próxima entrega` --references--> `check()`  [INFERRED]
  docs/setup.md → scripts/painel-db.mjs

## Import Cycles
- None detected.

## Communities (92 total, 7 thin omitted)

### Community 0 - "wf02.tsx"
Cohesion: 0.12
Nodes (12): @radix-ui/react-tabs, TabsContent, TabsList, TabsTrigger, FOLLOWUP_ROTULO, SITUACAO, STATUS_ESTILO, TEMPERATURA_ESTILO (+4 more)

### Community 1 - "button.tsx"
Cohesion: 0.11
Nodes (22): @radix-ui/react-alert-dialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay (+14 more)

### Community 2 - "routeTree.gen.ts"
Cohesion: 0.07
Nodes (35): getRouter(), payloadSchema, Route, segredoValido(), Route, Route, Route, Route (+27 more)

### Community 3 - "db.ts"
Cohesion: 0.13
Nodes (30): Estratégia de testes, ref_bun_test, ref_node_child_process, ref_node_crypto, ref_node_fs, comTransacao(), getPoolRw(), bancoTesteAtivo (+22 more)

### Community 4 - "lucide-react"
Cohesion: 0.09
Nodes (18): input-otp, lucide-react, @radix-ui/react-accordion, @radix-ui/react-checkbox, @radix-ui/react-radio-group, react-resizable-panels, AccordionContent, AccordionItem (+10 more)

### Community 5 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+10 more)

### Community 6 - "__root.tsx"
Cohesion: 0.13
Nodes (11): ref_styles_css_url, PwaRegistrar(), SidebarInset, Toaster(), ToasterProps, ALERTA_ESTILO, Sessao, Alerta (+3 more)

### Community 7 - "exigirAdmin"
Cohesion: 0.17
Nodes (23): zod, Route, exigirAdmin, Conversa, Direcao, getConversas, getMensagens, iso() (+15 more)

### Community 8 - "kanban.tsx"
Cohesion: 0.11
Nodes (15): Badge(), BadgeProps, badgeVariants, src_components_ui_dialog_dialogtrigger, ScrollArea, ScrollBar, Evento(), FILTROS (+7 more)

### Community 9 - "react"
Cohesion: 0.12
Nodes (15): @radix-ui/react-hover-card, @radix-ui/react-popover, @radix-ui/react-progress, @radix-ui/react-slider, react, Alert, AlertDescription, AlertTitle (+7 more)

### Community 10 - "cn"
Cohesion: 0.06
Nodes (44): @radix-ui/react-avatar, @radix-ui/react-context-menu, @radix-ui/react-dropdown-menu, vaul, Avatar, AvatarFallback, AvatarImage, ContextMenuCheckboxItem (+36 more)

### Community 11 - "reports.tsx"
Cohesion: 0.08
Nodes (27): recharts, ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, getPayloadConfigFromPayload() (+19 more)

### Community 12 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 13 - "Especificação · Painel da equipe (login, push, fila de followups, admin)"
Cohesion: 0.05
Nodes (36): 0. O contexto em cinco parágrafos, 10. Variáveis de ambiente, 11. Armadilhas conhecidas (todas já custaram tempo aqui), 12. Resumo do contrato com o n8n, 1. O que já existe (não recriar), 2. O que construir, 4. Fase B — Login e sessão, 5. Fase C — App instalável (PWA) (+28 more)

### Community 14 - "templates.tsx"
Cohesion: 0.09
Nodes (32): Task 12: Envio pelo app, Switch, Table, TableBody, TableCaption, TableCell, TableFooter, TableHead (+24 more)

### Community 15 - "painel-db.mjs"
Cohesion: 0.15
Nodes (19): 3. Fase A — Banco, A1. A segunda role: `painel_rw`, A2. Views novas, A3. Script, ✅ Aceite da Fase A, apply(), AQUI, check() (+11 more)

### Community 16 - "iniciar.ts"
Cohesion: 0.17
Nodes (23): Motor, Módulos server-only, Task 10: Super admin da fase 1, alterarAtendente, chaveDeOrdemEvolution(), obterAdaptador(), Extra, logErro() (+15 more)

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
Cohesion: 0.05
Nodes (36): 10. Fases, 11. Pendências que dependem de dado real, 12. Deixado para o construtor, 1. Intenção, 3. Objetivos, não-objetivos, anti-objetivos, 4.1 Fila de entrada (webhooks), 4.2 Tarefas agendadas, 4.3 Evolution Go (+28 more)

### Community 22 - "index.tsx"
Cohesion: 0.11
Nodes (36): Base existente — não recriar, Componentes e comportamentos reutilizáveis, 2. Esta decisão substitui regras anteriores, src_components_ui_tabs_tabs, OpportunityWorkspace(), dataHora(), dataHoraCompleta(), desde() (+28 more)

### Community 23 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, build, build:dev, check, db:apply, db:check, db:migrate, dev (+9 more)

### Community 24 - "command.tsx"
Cohesion: 0.10
Nodes (19): cmdk, @radix-ui/react-dialog, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList (+11 more)

### Community 25 - "getPoolMotor"
Cohesion: 0.13
Nodes (22): Organização do código, MonitorDaFila(), db(), DonoDoLeadInfo, getMonitorFila, lerMonitorFila(), MonitorFila, reprocessarEvento (+14 more)

### Community 26 - "ingestao.ts"
Cohesion: 0.15
Nodes (18): Task 6: Entrada de mensagens (porta do WF-01), src_server_db_poolclient, EventoConexao, aplicarEvento(), Autoria, registrar(), gravarMensagem(), registrarMensagem() (+10 more)

### Community 27 - "navigation-menu.tsx"
Cohesion: 0.13
Nodes (16): class-variance-authority, @radix-ui/react-navigation-menu, @radix-ui/react-toggle, @radix-ui/react-toggle-group, NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList (+8 more)

### Community 28 - "sidebar.tsx"
Cohesion: 0.07
Nodes (37): Layout e revisão, @radix-ui/react-separator, @radix-ui/react-tooltip, navAdmin, Separator, src_components_ui_sheet_sheet, Sidebar, SidebarContent (+29 more)

### Community 29 - "Review Focus"
Cohesion: 0.10
Nodes (17): Decisões deste plano (construtor), Global Constraints, Review Focus, Task 11: Respostas rápidas em `/templates`, Task 13 (BLOQUEADA): Adaptador Evolution Go a partir de eventos reais, Task 14: Corte na virada, Task 15: Documentação e fechamento, Task 1: Legado n8n e regras de dados (+9 more)

### Community 30 - "form.tsx"
Cohesion: 0.10
Nodes (22): @radix-ui/react-label, @radix-ui/react-slot, react-hook-form, Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList (+14 more)

### Community 31 - "package.json"
Cohesion: 0.07
Nodes (26): name, private, sideEffects, type, clsx, date-fns, eslint-config-prettier, @hookform/resolvers (+18 more)

### Community 32 - "getPool"
Cohesion: 0.14
Nodes (20): @tanstack/react-start, FollowupsPage(), abrirNoWhatsApp(), MinhaFilaPage(), abrirNoWhatsApp(), Route, exigirAtendente, createPool() (+12 more)

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
Cohesion: 0.09
Nodes (22): Arquitetura atual do Wake Club Dashboard, Base existente e regras vigentes do painel, Contexto do sistema, Entidades da equipe, Entidades do CRM, Estado da fase 1, Estado validado nesta Fase 0, Fluxo de uma conversa até a ação humana (legado) (+14 more)

### Community 35 - "admin.ts"
Cohesion: 0.14
Nodes (15): bcryptjs, CadastroAtendente(), cadastrar(), Route, alterarAtendenteSchema, AparelhoAdmin, AtendenteAdmin, criarAtendente (+7 more)

### Community 36 - "WakeCRM · Wake Club"
Cohesion: 0.13
Nodes (14): Fluxos que existem hoje, Fora de escopo, Histórico da refatoração por oportunidades, Leitura prática das fases, Mandato atual, Manutenção, Pendências, Problema e objetivo (+6 more)

### Community 37 - "minha-fila.tsx"
Cohesion: 0.20
Nodes (15): sonner, @tanstack/react-query, @tanstack/react-router, Card, CardContent, CardFooter, CardHeader, CardTitle (+7 more)

### Community 38 - "envio.ts"
Cohesion: 0.14
Nodes (14): linhas(), enviarMensagem, EnvioApp, gravarEnvio(), MIME_DOCUMENTO, podeEnviar(), schemaEnvio, textoDoEnvio() (+6 more)

### Community 39 - "migrar.mjs"
Cohesion: 0.14
Nodes (15): Git e colaboração, Stack e execução, eslint, ref_node_path, ref_node_url, pg, argumentoAte(), carregarEnv() (+7 more)

### Community 40 - "select.tsx"
Cohesion: 0.17
Nodes (14): @radix-ui/react-select, src_components_ui_select_select, SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator (+6 more)

### Community 41 - "Preparação local"
Cohesion: 0.29
Nodes (7): Agentes, Banco, Preparação local, Primeira execução, Problemas conhecidos, Pré-requisitos, Verificar

### Community 42 - "README.md"
Cohesion: 0.20
Nodes (5): Design e acessibilidade, Direção, Interação, Manutenção, Sistema existente

### Community 43 - "receber.ts"
Cohesion: 0.28
Nodes (9): Route, Route, enfileirar(), grandeDemais(), naoEncontrado(), Origem, receberWebhook(), SEGREDO (+1 more)

### Community 44 - "distribuicao.ts"
Cohesion: 0.27
Nodes (10): atribuir(), atribuirSeSemDono(), carregarVendedores(), corrigirDono(), atribuir(), escolherPorPeso(), MotivoAtribuicao, semAcento() (+2 more)

### Community 45 - "minha-fila/fila.ts"
Cohesion: 0.27
Nodes (8): classificar(), diaEmSaoPaulo(), horasDesde(), ItemMinhaFila, MinhaFilaOrganizada, organizarMinhaFila(), SecaoMinhaFila, LeadFilaOperacional

### Community 46 - "Qualidade"
Cohesion: 0.20
Nodes (9): Avaliação do harness, Comandos, Dependências e entrega, Linha de base de 04/11/2026 (regras herdadas em `warn`), Lint tipado, Qualidade, Regras de base, Revisão de segurança (+1 more)

### Community 47 - "Setup do toolkit e evidência"
Cohesion: 0.25
Nodes (8): Checagens, Componentes, Decisões e fontes, Documentação criada, Fonte e contexto, Memória e evidência do harness, Pendências e próxima entrega, Setup do toolkit e evidência

### Community 48 - "Runbook da virada para o motor próprio"
Cohesion: 0.33
Nodes (5): Endpoint do webhook da Evolution, Passos, Runbook da virada para o motor próprio, Se algo der errado antes do passo 7, Variáveis de ambiente novas

### Community 89 - "admin.tsx"
Cohesion: 0.13
Nodes (19): src_components_ui_alert_dialog_alertdialog, src_components_ui_alert_dialog_alertdialogtrigger, CardDescription, DialogContent, DialogDescription, DialogFooter(), DialogHeader(), DialogOverlay (+11 more)

### Community 96 - "eslint.config.js"
Cohesion: 0.17
Nodes (10): camadasUi, testFiles, eslint-import-resolver-typescript, @eslint/js, eslint-plugin-import-x, eslint-plugin-prettier, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+2 more)

### Community 100 - "vite.config.ts"
Cohesion: 0.33
Nodes (4): nitro, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 102 - "leads.ts"
Cohesion: 0.50
Nodes (4): Route, getLeadsPainel, iso(), Row

### Community 103 - "plan(2).md"
Cohesion: 0.08
Nodes (23): Administrador, Administrador, Atendente, Backend, COMPATIBILIDADE, DEFINIÇÃO DE PRONTO — PRODUTO, Estrutura sugerida, Exemplo (+15 more)

### Community 104 - "Botão "não atender" — especificação para o front"
Cohesion: 0.14
Nodes (13): 0. Por que este botão existe, 1. A regra que este botão não pode quebrar, 2. O que já está pronto — não refazer, 3.1 Server function — em `src/server/leads.ts`, 3.2 Expor o estado na listagem, 3.3 O botão, 3. O que construir, 4. O que marcar de fato faz — e o que não faz (+5 more)

### Community 105 - "AGENTS.md · WakeCRM (Wake Club)"
Cohesion: 0.20
Nodes (10): Acordos de trabalho, AGENTS.md · WakeCRM (Wake Club), Comandos canônicos, Continuidade, Convenções de implementação, Delegação e revisão, Ferramentas e estilo, Produto e fontes (+2 more)

### Community 106 - "auth.ts"
Cohesion: 0.23
Nodes (14): B6. Cabeçalho, AppSidebar(), encerrarSessao(), LoginPage(), enviar(), cookieSeguro(), entrar, estaBloqueado() (+6 more)

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

### Community 140 - "instalar.tsx"
Cohesion: 0.10
Nodes (23): Task 9: Push pelo motor (porta do WF-09) e aviso de mensagem nova, web-push, apelidoDoAparelho(), ativarPush(), base64UrlParaUint8Array(), EstadoPwa, EventoInstalacao, InstalarPage() (+15 more)

### Community 145 - "Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace, Source Nodes

### Community 146 - "Q: O que precisa ser feito no n8n para a Fase 3?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: O que precisa ser feito no n8n para a Fase 3?, Source Nodes

## Knowledge Gaps
- **573 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `css` (+568 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 661 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `OpportunityWorkspace()` (2× useful, score=1.99344972)
- `AdminPage()` (2× useful, score=1.991127676) _(code changed — re-verify)_
- `FollowupsPage()` (2× useful, score=1.991127676)
- `getPainelAdmin` (2× useful, score=1.991127676) _(code changed — re-verify)_
- `getMensagens` (2× useful, score=1.991127676)
- `listarMinhaFila` (2× useful, score=1.991127676) _(code changed — re-verify)_

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `OpportunityWorkspace()` connect `index.tsx` to `FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE`, `WakeCRM · Wake Club`, `exigirAdmin`, `kanban.tsx`, `cn`, `Avaliar remoção da navegação principal`, `WakeCRM · motor próprio, sem n8n`?**
  _High betweenness centrality (0.232) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `wf02.tsx`, `button.tsx`, `lucide-react`, `minha-fila.tsx`, `__root.tsx`, `kanban.tsx`, `react`, `select.tsx`, `reports.tsx`, `templates.tsx`, `carousel.tsx`, `index.tsx`, `command.tsx`, `admin.tsx`, `navigation-menu.tsx`, `sidebar.tsx`, `form.tsx`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **Why does `Critério de aceite` connect `FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE` to `index.tsx`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `getPoolMotor()` (e.g. with `Motor` and `Módulos server-only`) actually correct?**
  _`getPoolMotor()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _573 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `wf02.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11578947368421053 - nodes in this community are weakly interconnected._
- **Should `button.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11076923076923077 - nodes in this community are weakly interconnected._