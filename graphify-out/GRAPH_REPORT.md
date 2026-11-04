# Graph Report - dash-wakeclub-crm-wpp  (2026-11-04)

## Corpus Check
- 313 files · ~697,138 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 6, .toml 1, .template 1)

## Summary
- 2209 nodes · 5820 edges · 128 communities (121 shown, 7 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 269 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a1b678e6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- comTransacao
- pagination.tsx
- routeTree.gen.ts
- getPoolMotor
- lucide-react
- compilerOptions
- __root.tsx
- getPool
- admin.tsx
- react
- cn
- reports.tsx
- components.json
- Especificação · Painel da equipe (login, push, fila de followups, admin)
- Composer.tsx
- painel-db.mjs
- iniciar.ts
- fetch
- carousel.tsx
- devDependencies
- dependencies
- WakeCRM · motor próprio, sem n8n
- wf02.tsx
- scripts
- command.tsx
- admin-ia.ts
- paraE164
- class-variance-authority
- sidebar.tsx
- Review Focus
- form.tsx
- package.json
- exigirAtendente
- core-rules.cjs
- followups
- exigirAdmin
- WakeCRM · Wake Club
- @tanstack/react-router
- ingestao.ts
- migrar.mjs
- pipeline.tsx
- Preparação local
- server/vendas.ts
- receber.ts
- distribuicao.db.test.ts
- minha-fila/fila.ts
- Qualidade
- Setup do toolkit e evidência
- Runbook da virada para o motor próprio
- n8n-legado/README.md
- banco-teste.sh
- test-db.sh
- dinheiro.ts
- motor/redator.ts
- aprovacao.ts
- motor/qualificador.ts
- AppShell.tsx
- Conversa.tsx
- FolhaMotivos.tsx
- ListaConversas.tsx
- AdaptadorEvolution
- sheet.tsx
- visao-geral.tsx
- redator.test.ts
- extrair.mjs
- redator.db.test.ts
- Arquitetura atual do WakeCRM (Wake Club Dashboard)
- openai.ts
- MenuUsuario.tsx
- AlertasOperacao.tsx
- qualificador.db.test.ts
- ref_node_crypto
- WakeCRM · fases 2 e 3 · IA de volta e follow-up com aprovação
- Review Focus
- WakeCRM · fase 4 · vendas, categorias, comissão e painéis em dinheiro
- prompts.test.ts
- navigation-menu.tsx
- breadcrumb.tsx
- 4. Fase B — Login e sessão
- normalizar.ts
- 7. Fase E — `/followups`, a tela principal
- 5. Fase C — App instalável (PWA)
- 6. Fase D — Push
- Review Focus
- 3. Fase A — Banco
- Referências de interface (WakeCRM)
- WakeCRM fase 1 · Atendimento volta · Plano de implementação
- Histórico da refatoração por oportunidades
- VendasSemDono.tsx
- eslint.config.js
- @radix-ui/react-aspect-ratio
- @radix-ui/react-collapsible
- vite.config.ts
- leads.ts
- plan(2).md
- Botão "não atender" — especificação para o front
- AGENTS.md · WakeCRM (Wake Club)
- meus-leads.tsx
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
- ativarPush
- Routes
- Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace
- Q: O que precisa ser feito no n8n para a Fase 3?

## God Nodes (most connected - your core abstractions)
1. `cn()` - 286 edges
2. `getPoolMotor()` - 116 edges
3. `react` - 81 edges
4. `lucide-react` - 77 edges
5. `exigirAdmin` - 71 edges
6. `comTransacao()` - 62 edges
7. `getPoolRw()` - 39 edges
8. `getPool()` - 38 edges
9. `registrarMensagem()` - 38 edges
10. `@tanstack/react-router` - 37 edges

## Surprising Connections (you probably didn't know these)
- `Comandos` --references--> `check()`  [INFERRED]
  docs/quality.md → scripts/painel-db.mjs
- `Lint tipado` --references--> `check()`  [INFERRED]
  docs/quality.md → scripts/painel-db.mjs
- `Memória e evidência do harness` --references--> `check()`  [INFERRED]
  docs/setup.md → scripts/painel-db.mjs
- `Pendências e próxima entrega` --references--> `check()`  [INFERRED]
  docs/setup.md → scripts/painel-db.mjs
- `Task 3: Para avaliar (`/aprovar`)` --references--> `validarMotivos()`  [INFERRED]
  docs/superpowers/plans/2026-11-05-wakecrm-interface.md → src/features/aprovacao/motivos.ts

## Import Cycles
- None detected.

## Communities (128 total, 7 thin omitted)

### Community 0 - "comTransacao"
Cohesion: 0.10
Nodes (41): AGORA, avaliacoes(), cenario(), db(), eventos(), followup(), SUGERIDO, schemaDecisao (+33 more)

### Community 1 - "pagination.tsx"
Cohesion: 0.20
Nodes (9): ButtonProps, Pagination(), PaginationContent, PaginationEllipsis(), PaginationItem, PaginationLink(), PaginationLinkProps, PaginationNext() (+1 more)

### Community 2 - "routeTree.gen.ts"
Cohesion: 0.06
Nodes (47): getRouter(), Route, segredoValido(), Route, Route, Route, Route, Route (+39 more)

### Community 3 - "getPoolMotor"
Cohesion: 0.11
Nodes (23): Base existente — não recriar, Task 2: Migrações, role do motor e banco de teste, ref_bun_test, ref_node_child_process, db(), getPoolMotor(), bancoTesteAtivo, avisos() (+15 more)

### Community 4 - "lucide-react"
Cohesion: 0.10
Nodes (32): lucide-react, @tanstack/react-query, CHAVE_PAINEL_IA, Item(), PainelIa(), CHAVE_RITMO, MODOS, Ritmo() (+24 more)

### Community 5 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+10 more)

### Community 6 - "__root.tsx"
Cohesion: 0.06
Nodes (42): Design e acessibilidade, Direção, Interação, Layout e revisão, Manutenção, Modo e densidade, Referências visuais, Regras de contraste (medidas) (+34 more)

### Community 7 - "getPool"
Cohesion: 0.11
Nodes (31): InboxPage(), Route, Conversa, Direcao, getConversas, getLinhaDoTempo, getMensagens, iso() (+23 more)

### Community 8 - "admin.tsx"
Cohesion: 0.08
Nodes (31): CardDescription, src_components_ui_dialog_dialog, DialogContent, DialogDescription, DialogFooter(), DialogHeader(), DialogTitle, src_components_ui_dialog_dialogtrigger (+23 more)

### Community 9 - "react"
Cohesion: 0.18
Nodes (18): react, Input, Label, labelVariants, Switch, Table, TableBody, TableCell (+10 more)

### Community 10 - "cn"
Cohesion: 0.04
Nodes (59): input-otp, @radix-ui/react-accordion, @radix-ui/react-avatar, @radix-ui/react-context-menu, @radix-ui/react-hover-card, @radix-ui/react-menubar, @radix-ui/react-progress, @radix-ui/react-slider (+51 more)

### Community 11 - "reports.tsx"
Cohesion: 0.08
Nodes (27): recharts, ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, getPayloadConfigFromPayload() (+19 more)

### Community 12 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 13 - "Especificação · Painel da equipe (login, push, fila de followups, admin)"
Cohesion: 0.18
Nodes (10): 0. O contexto em cinco parágrafos, 10. Variáveis de ambiente, 11. Armadilhas conhecidas (todas já custaram tempo aqui), 12. Resumo do contrato com o n8n, 1. O que já existe (não recriar), 2. O que construir, 8. Fase F — `/meus-leads`, 9. Fase G — `/admin` (+2 more)

### Community 14 - "Composer.tsx"
Cohesion: 0.11
Nodes (19): Task 12: Envio pelo app, 1. Objetivo, 2. Tokens e temas **[construtor]**, 3. Shell e navegação **[construtor, a partir das referências]**, 4. Telas (todas seguem a imagem indicada em `docs/ref/README.md`), 5. Fora de escopo, 6. Testes, WakeCRM · interface · temas, densidade e telas de referência (+11 more)

### Community 15 - "painel-db.mjs"
Cohesion: 0.22
Nodes (14): apply(), AQUI, check(), conectar(), cor, diagnosticarConexao(), exigir(), linha() (+6 more)

### Community 16 - "iniciar.ts"
Cohesion: 0.08
Nodes (48): Motor, Módulos server-only, Handoff (05/11/2026), Task 8: Admin (Ritmo e IA) e ligação das tarefas, registrarExecucao(), enviarMensagem, obterAdaptador(), ErroEnvio (+40 more)

### Community 17 - "fetch"
Cohesion: 0.21
Nodes (10): Stack e execução, 2. Cliente de IA **[construtor]**, consumeLastCapturedError(), renderErrorPage(), fetch(), getServerEntry(), isH3SwallowedErrorBody(), normalizeCatastrophicSsrResponse() (+2 more)

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
Nodes (37): 10. Fases, 11. Pendências que dependem de dado real, 12. Deixado para o construtor, 1. Intenção, 2. Esta decisão substitui regras anteriores, 3. Objetivos, não-objetivos, anti-objetivos, 4.1 Fila de entrada (webhooks), 4.2 Tarefas agendadas (+29 more)

### Community 22 - "wf02.tsx"
Cohesion: 0.07
Nodes (48): AvatarIniciais(), corDoAvatar(), iniciais(), TAMANHOS, ChipTemperatura(), ESTILO, Temperatura, src_components_ui_tabs_tabs (+40 more)

### Community 23 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, build, build:dev, check, db:apply, db:check, db:migrate, dev (+9 more)

### Community 24 - "command.tsx"
Cohesion: 0.18
Nodes (9): cmdk, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator (+1 more)

### Community 25 - "admin-ia.ts"
Cohesion: 0.13
Nodes (21): aplicarRitmo(), db(), definirRitmoAdmin, entradaRitmo, getPainelIa, lerPainelIa(), lerRitmoAdmin(), PainelIa (+13 more)

### Community 26 - "paraE164"
Cohesion: 0.38
Nodes (5): 4. Cruzamento e categoria **[design §8.2, §8.3]**, O que precisa do dono, registrarMovimento(), ehOptOut(), paraE164()

### Community 27 - "class-variance-authority"
Cohesion: 0.18
Nodes (12): class-variance-authority, @radix-ui/react-toggle, @radix-ui/react-toggle-group, Alert, AlertDescription, AlertTitle, alertVariants, ToggleGroup (+4 more)

### Community 28 - "sidebar.tsx"
Cohesion: 0.07
Nodes (33): Separator, Sidebar, SidebarContent, SidebarContext, SidebarContextProps, SidebarFooter, SidebarGroup, SidebarGroupAction (+25 more)

### Community 29 - "Review Focus"
Cohesion: 0.15
Nodes (13): Review Focus, Task 11: Respostas rápidas em `/templates`, Task 14: Corte na virada, Task 15: Documentação e fechamento, Task 1: Legado n8n e regras de dados, Task 3: Endpoints de webhook (gravar bruto), Task 4: Fila de entrada e agenda do motor, Task 5: Contrato do adaptador Evolution (+5 more)

### Community 30 - "form.tsx"
Cohesion: 0.19
Nodes (12): @radix-ui/react-label, react-hook-form, FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext (+4 more)

### Community 31 - "package.json"
Cohesion: 0.07
Nodes (29): name, private, sideEffects, type, clsx, date-fns, eslint-config-prettier, @hookform/resolvers (+21 more)

### Community 32 - "exigirAtendente"
Cohesion: 0.23
Nodes (11): FollowupsPage(), abrirNoWhatsApp(), Route, MinhaFilaPage(), abrirNoWhatsApp(), Route, exigirAtendente, iso() (+3 more)

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

### Community 34 - "followups"
Cohesion: 0.24
Nodes (10): Entidades da equipe, Entidades do CRM, Modelo de dados, `painel_ro`, `painel_rw`, Relações principais, Roles e privilégios, `wakecrm_motor` (+2 more)

### Community 35 - "exigirAdmin"
Cohesion: 0.06
Nodes (57): Organização do código, Shell, navegação e preferências, bcryptjs, @tanstack/react-start, zod, DonoDoLead(), PrecoHora(), Route (+49 more)

### Community 36 - "WakeCRM · Wake Club"
Cohesion: 0.20
Nodes (10): Fluxos que existem hoje, Fora de escopo, Manutenção, Pendências, Problema e objetivo, Próxima entrega, Público e papéis, Requisitos permanentes (+2 more)

### Community 37 - "@tanstack/react-router"
Cohesion: 0.13
Nodes (19): sonner, @tanstack/react-router, Button, Calendar(), CalendarDayButton(), Card, CardContent, CardFooter (+11 more)

### Community 38 - "ingestao.ts"
Cohesion: 0.07
Nodes (35): src_server_db_poolclient, linhas(), EnvioApp, gravarEnvio(), MIME_DOCUMENTO, podeEnviar(), schemaEnvio, textoDoEnvio() (+27 more)

### Community 39 - "migrar.mjs"
Cohesion: 0.21
Nodes (11): Git e colaboração, Handoff (05/11/2026), Imagem Docker, pg, argumentoAte(), carregarEnv(), garantirRoleMotor(), main() (+3 more)

### Community 40 - "pipeline.tsx"
Cohesion: 0.15
Nodes (19): src_components_ui_select_select, SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger (+11 more)

### Community 41 - "Preparação local"
Cohesion: 0.25
Nodes (8): Agentes, Banco, Onde olhar, Preparação local, Primeira execução, Problemas conhecidos, Pré-requisitos, Verificar

### Community 42 - "server/vendas.ts"
Cohesion: 0.11
Nodes (29): estornoPosFechamento(), vendaAtrasada(), aplicarVinculo(), criarProcessadorVendas(), cruzar(), db(), eventos(), lerVenda() (+21 more)

### Community 43 - "receber.ts"
Cohesion: 0.24
Nodes (11): Route, Route, getPoolWebhook(), chaveDeOrdemEvolution(), enfileirar(), grandeDemais(), naoEncontrado(), Origem (+3 more)

### Community 44 - "distribuicao.db.test.ts"
Cohesion: 0.19
Nodes (16): Task 10: Super admin da fase 1, desativarTodos(), atribuir(), atribuirSeSemDono(), carregarVendedores(), corrigirDono(), atribuir(), db() (+8 more)

### Community 45 - "minha-fila/fila.ts"
Cohesion: 0.27
Nodes (8): classificar(), diaEmSaoPaulo(), horasDesde(), ItemMinhaFila, MinhaFilaOrganizada, organizarMinhaFila(), SecaoMinhaFila, LeadFilaOperacional

### Community 46 - "Qualidade"
Cohesion: 0.22
Nodes (8): Avaliação do harness, Comandos, Dependências e entrega, Lint tipado, Qualidade, Regras de base, Revisão de segurança, Revisão depois de implementar ou corrigir

### Community 47 - "Setup do toolkit e evidência"
Cohesion: 0.25
Nodes (8): Checagens, Componentes, Decisões e fontes, Documentação criada, Fonte e contexto, Memória e evidência do harness, Pendências e próxima entrega, Setup do toolkit e evidência

### Community 48 - "Runbook da virada para o motor próprio"
Cohesion: 0.25
Nodes (7): Endpoint do webhook da Evolution, Passos, Portões da Task 13 (antes de publicar o adaptador), Pré-checagem do corte, Runbook da virada para o motor próprio, Se algo der errado antes do passo 9, Variáveis de ambiente novas

### Community 52 - "dinheiro.ts"
Cohesion: 0.11
Nodes (30): CATEGORIAS, db(), precoHora(), vendedor(), dia, getPainelVendedor, getRankingSemanal, getResumoDinheiro (+22 more)

### Community 53 - "motor/redator.ts"
Cohesion: 0.12
Nodes (26): Ritmo, cota, janela e intervalo, Task 6: Envio dos aprovados, blocoAvaliacoes(), ETAPAS_CONCRETAS, formatarAvaliacoes(), linhaAvaliacao(), PERMITIDOS, aplicar() (+18 more)

### Community 54 - "aprovacao.ts"
Cohesion: 0.14
Nodes (22): BotaoRedondo(), TEMPERATURAS, Decisao, src_features_aprovacao_motivos_motivos_envio, src_features_aprovacao_motivos_motivos_recusa, BotaoRedondo(), Sugestao, SugestaoDaConversa() (+14 more)

### Community 55 - "motor/qualificador.ts"
Cohesion: 0.15
Nodes (20): SCHEMA, SISTEMA, VERSAO_PROMPT, carimboValido(), Contexto, ETIQUETAS, gravar(), LinhaLead (+12 more)

### Community 56 - "AppShell.tsx"
Cohesion: 0.19
Nodes (13): Componentes, Global Constraints, WakeCRM interface · temas, densidade e telas de referência · Plano, AppShell(), BarraInferior(), BarraLateral(), MenuUsuario(), abasCelularAdmin (+5 more)

### Community 57 - "Conversa.tsx"
Cohesion: 0.22
Nodes (14): Bolha(), MensagemConversa, Conversa(), ICONE_CHIP, LinhaDoTempoChips(), ChipLinha, dataDoChip(), EventoLinha (+6 more)

### Community 58 - "FolhaMotivos.tsx"
Cohesion: 0.18
Nodes (13): vaul, Drawer(), DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle (+5 more)

### Community 59 - "ListaConversas.tsx"
Cohesion: 0.19
Nodes (12): filtrarConversas(), FiltroConversa, ItemConversa, normalizar(), PASSA, LISTA, CHIPS, ListaConversas() (+4 more)

### Community 60 - "AdaptadorEvolution"
Cohesion: 0.18
Nodes (10): Estratégia de testes, Handoff (04/11/2026), Task 13 (BLOQUEADA): Adaptador Evolution Go a partir de eventos reais, Decisões deste plano, Global Constraints, Task 2: Transcrição (porta do WF-11), WakeCRM fases 2 e 3 · IA de volta e follow-up com aprovação · Plano, AdaptadorEvolution (+2 more)

### Community 61 - "sheet.tsx"
Cohesion: 0.17
Nodes (13): @radix-ui/react-dialog, useSair(), src_components_ui_sheet_sheet, SheetContent, SheetContentProps, SheetDescription, SheetFooter(), SheetHeader() (+5 more)

### Community 62 - "visao-geral.tsx"
Cohesion: 0.28
Nodes (9): Skeleton(), percentuaisPorMaiorResto(), textoPercentual(), DesempenhoVendedores(), MEDALHA, CATEGORIAS, SEM_DONO, VendasPorCategoria() (+1 more)

### Community 63 - "redator.test.ts"
Cohesion: 0.25
Nodes (13): Linha de base (regras herdadas em `warn`), Task 5: Porteiro, redator, cota, ritmo e expiração, comAvaliacoes(), conversaDe(), decidir(), src_server_motor_redator_linhafollowup, modoDoFollowup(), montarPromptPorteiro() (+5 more)

### Community 64 - "extrair.mjs"
Cohesion: 0.14
Nodes (10): eslint, ref_node_path, ref_node_url, prettier, dataAccess, ruleTester, testFilenames, ALVOS (+2 more)

### Community 65 - "redator.db.test.ts"
Cohesion: 0.20
Nodes (12): SCHEMA, SISTEMA, VERSAO_PROMPT, carimbo(), db(), eventos(), followup(), gastarCota() (+4 more)

### Community 66 - "Arquitetura atual do WakeCRM (Wake Club Dashboard)"
Cohesion: 0.14
Nodes (14): Arquitetura atual do WakeCRM (Wake Club Dashboard), Base existente e regras vigentes do painel, Ciclo de vida do follow-up, Contexto do sistema, Estado das fases, Estado validado na Fase 0 (histórico), Fila de aprovação e avaliações, Fluxo de uma conversa até a ação humana (legado) (+6 more)

### Community 67 - "openai.ts"
Cohesion: 0.19
Nodes (10): IA, Task 1: Migração 0004, cliente de IA, prompts e valor esperado, ErroIa, FetchFn, pedir(), tentar(), Chamada, conteudo() (+2 more)

### Community 68 - "MenuUsuario.tsx"
Cohesion: 0.18
Nodes (12): @radix-ui/react-dropdown-menu, src_components_ui_dropdown_menu_dropdownmenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator (+4 more)

### Community 69 - "AlertasOperacao.tsx"
Cohesion: 0.26
Nodes (10): FechamentoMes(), diaSP(), mesAnterior(), rotuloMes(), Alerta, AlertasOperacao(), montar(), Kpis() (+2 more)

### Community 70 - "qualificador.db.test.ts"
Cohesion: 0.23
Nodes (8): clienteIaFalso(), PedidoChat, PedidoTranscricao, carimbo(), db(), eventos(), lead(), minutosAte()

### Community 71 - "ref_node_crypto"
Cohesion: 0.19
Nodes (10): Rotas e superfícies HTTP, ref_node_crypto, web-push, payloadSchema, testarNotificacaoDaAtendente, entregarPush(), Inscricao, mensagemDoErro() (+2 more)

### Community 72 - "WakeCRM · fases 2 e 3 · IA de volta e follow-up com aprovação"
Cohesion: 0.17
Nodes (11): 10. Telas e navegação, 11. Fora de escopo, 12. Testes exigidos, 1. Objetivo, 3. Transcrição (porta do WF-11), 4. Qualificador (porta do WF-02 + `horas_estimadas`), 6. Porteiro e redator (porta do WF-03), 7. Modos de ritmo **[design §7.3 + construtor]** (+3 more)

### Community 73 - "Review Focus"
Cohesion: 0.18
Nodes (10): Global Constraints, Handoff (05/11/2026), Review Focus, Task 1: Migração 0005 e regras puras, Task 2: Processador de vendas, cruzamento e vínculo manual, Task 3: Fechamento do dia 10 e lançamentos, Task 4: Resumo em dinheiro e painel do vendedor, Task 5: Telas de dinheiro (+2 more)

### Community 74 - "WakeCRM · fase 4 · vendas, categorias, comissão e painéis em dinheiro"
Cohesion: 0.20
Nodes (9): 1. Objetivo, 2. Webhook de vendas (provisório) **[construtor]**, 3. Tabela `vendas` (migração `0005_vendas.sql`) **[construtor]**, 5. Estorno **[design §8.4]**, 6. Fechamento no dia 10 **[design §8.4 + construtor]**, 7. Painéis em dinheiro **[design §9]**, 8. Fora de escopo, 9. Testes (+1 more)

### Community 75 - "prompts.test.ts"
Cohesion: 0.28
Nodes (7): ref_node_fs, SCHEMA, SISTEMA, VERSAO_PROMPT, no(), schema(), sistema()

### Community 76 - "navigation-menu.tsx"
Cohesion: 0.25
Nodes (8): @radix-ui/react-navigation-menu, NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 77 - "breadcrumb.tsx"
Cohesion: 0.22
Nodes (8): @radix-ui/react-slot, Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 78 - "4. Fase B — Login e sessão"
Cohesion: 0.25
Nodes (8): 4. Fase B — Login e sessão, ✅ Aceite da Fase B, B1. Dependências, B2. `src/server/db.ts` — a segunda conexão, B3. `src/server/auth.ts` (novo), B4. Proteção das rotas, B5. Tela `/login`, B6. Cabeçalho

### Community 79 - "normalizar.ts"
Cohesion: 0.46
Nodes (6): achar(), ehObj(), normalizarVenda(), numero(), Obj, ok()

### Community 80 - "7. Fase E — `/followups`, a tela principal"
Cohesion: 0.29
Nodes (7): 7. Fase E — `/followups`, a tela principal, ✅ Aceite da Fase E, E1. Dados, E2. Layout, E3. O botão — e a armadilha do iOS, E4. O que a tela NÃO faz, E5. Atualização

### Community 81 - "5. Fase C — App instalável (PWA)"
Cohesion: 0.33
Nodes (6): 5. Fase C — App instalável (PWA), ✅ Aceite da Fase C, C1. `public/manifest.webmanifest`, C2. `src/routes/__root.tsx` — head, C3. `public/sw.js`, C4. Tela `/instalar`

### Community 82 - "6. Fase D — Push"
Cohesion: 0.33
Nodes (6): 6. Fase D — Push, ✅ Aceite da Fase D, D1. Chaves VAPID, D2. Inscrição (cliente), D3. Recepção (service worker), D4. `POST /api/push/enviar` — quem chama é o n8n

### Community 83 - "Review Focus"
Cohesion: 0.40
Nodes (5): Review Focus, Task 3: Qualificador (porta do WF-02 + horas), Task 4: Ciclo de vida e server da aprovação, Task 7: Fila de aprovação (UI) — MOVIDA, Task 9: Documentação e fechamento

### Community 84 - "3. Fase A — Banco"
Cohesion: 0.40
Nodes (5): 3. Fase A — Banco, A1. A segunda role: `painel_rw`, A2. Views novas, A3. Script, ✅ Aceite da Fase A

### Community 85 - "Referências de interface (WakeCRM)"
Cohesion: 0.50
Nodes (3): Arquivos (`docs/ref/ui/`), Como usar, Referências de interface (WakeCRM)

### Community 86 - "WakeCRM fase 1 · Atendimento volta · Plano de implementação"
Cohesion: 0.50
Nodes (3): Decisões deste plano (construtor), Global Constraints, WakeCRM fase 1 · Atendimento volta · Plano de implementação

### Community 87 - "Histórico da refatoração por oportunidades"
Cohesion: 0.50
Nodes (4): Histórico da refatoração por oportunidades, Leitura prática das fases, Mandato atual, Produto que estamos construindo

### Community 89 - "VendasSemDono.tsx"
Cohesion: 0.18
Nodes (23): src_components_ui_alert_dialog_alertdialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogTitle (+15 more)

### Community 96 - "eslint.config.js"
Cohesion: 0.17
Nodes (10): camadasUi, testFiles, eslint-import-resolver-typescript, @eslint/js, eslint-plugin-import-x, eslint-plugin-prettier, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+2 more)

### Community 100 - "vite.config.ts"
Cohesion: 0.40
Nodes (4): nitro, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 102 - "leads.ts"
Cohesion: 0.07
Nodes (36): Componentes e comportamentos reutilizáveis, Review Focus, Task 2: Shell e navegação, Task 3: Para avaliar (`/aprovar`), Task 4: Conversa com linha do tempo, Task 5: Configurações e operação, Equipe, Task 6: Visão geral, Task 7: Pipeline (+28 more)

### Community 103 - "plan(2).md"
Cohesion: 0.08
Nodes (23): Administrador, Administrador, Atendente, Backend, COMPATIBILIDADE, DEFINIÇÃO DE PRONTO — PRODUTO, Estrutura sugerida, Exemplo (+15 more)

### Community 104 - "Botão "não atender" — especificação para o front"
Cohesion: 0.14
Nodes (13): 0. Por que este botão existe, 1. A regra que este botão não pode quebrar, 2. O que já está pronto — não refazer, 3.1 Server function — em `src/server/leads.ts`, 3.2 Expor o estado na listagem, 3.3 O botão, 3. O que construir, 4. O que marcar de fato faz — e o que não faz (+5 more)

### Community 105 - "AGENTS.md · WakeCRM (Wake Club)"
Cohesion: 0.12
Nodes (10): Acordos de trabalho, AGENTS.md · WakeCRM (Wake Club), Comandos canônicos, Continuidade, Convenções de implementação, Delegação e revisão, Ferramentas e estilo, Produto e fontes (+2 more)

### Community 106 - "meus-leads.tsx"
Cohesion: 0.18
Nodes (14): rotaInicial(), Route, LoginPage(), enviar(), Route, Ficha(), MeusLeadsPage(), Route (+6 more)

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
Cohesion: 0.29
Nodes (7): Configuração local, Desenvolvimento, Documentação, Estado e próximos passos, Qualidade e build, Requisitos, WakeCRM · Wake Club

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

### Community 140 - "ativarPush"
Cohesion: 0.27
Nodes (9): apelidoDoAparelho(), ativarPush(), base64UrlParaUint8Array(), InstalarPage(), ativarNotificacoes(), testarNotificacao(), rotuloPermissao(), getChavePublicaPush (+1 more)

### Community 145 - "Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace, Source Nodes

### Community 146 - "Q: O que precisa ser feito no n8n para a Fase 3?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: O que precisa ser feito no n8n para a Fase 3?, Source Nodes

## Knowledge Gaps
- **691 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `css` (+686 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 822 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `OpportunityWorkspace()` (2× useful, score=1.99344972) _(code changed — re-verify)_
- `AdminPage()` (2× useful, score=1.991127676) _(code changed — re-verify)_
- `FollowupsPage()` (2× useful, score=1.991127676)
- `getPainelAdmin` (2× useful, score=1.991127676) _(code changed — re-verify)_
- `getMensagens` (2× useful, score=1.991127676) _(code changed — re-verify)_
- `listarMinhaFila` (2× useful, score=1.991127676) _(code changed — re-verify)_

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `pagination.tsx`, `lucide-react`, `__root.tsx`, `getPool`, `admin.tsx`, `react`, `reports.tsx`, `carousel.tsx`, `wf02.tsx`, `command.tsx`, `class-variance-authority`, `sidebar.tsx`, `form.tsx`, `@tanstack/react-router`, `pipeline.tsx`, `aprovacao.ts`, `Conversa.tsx`, `FolhaMotivos.tsx`, `ListaConversas.tsx`, `sheet.tsx`, `visao-geral.tsx`, `MenuUsuario.tsx`, `navigation-menu.tsx`, `breadcrumb.tsx`, `VendasSemDono.tsx`, `leads.ts`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `OpportunityWorkspace()` connect `wf02.tsx` to `FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE`, `leads.ts`, `getPool`, `admin.tsx`, `cn`, `Composer.tsx`, `Avaliar remoção da navegação principal`, `WakeCRM · motor próprio, sem n8n`, `Histórico da refatoração por oportunidades`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE` connect `FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE` to `plan(2).md`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `getPoolMotor()` (e.g. with `Base existente — não recriar` and `Motor`) actually correct?**
  _`getPoolMotor()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _691 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `comTransacao` be split into smaller, more focused modules?**
  _Cohesion score 0.1036077705827937 - nodes in this community are weakly interconnected._
- **Should `routeTree.gen.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.055272108843537414 - nodes in this community are weakly interconnected._