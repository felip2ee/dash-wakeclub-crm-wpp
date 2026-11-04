# WakeCRM interface · temas, densidade e telas de referência · Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o app fica igual às imagens de `docs/ref/ui/` no tema verde, com tema rosa e densidade escolhíveis em Configurações.

**Architecture:** tokens e temas em `src/styles.css` por `data-tema`/`data-densidade`/`.dark`; preferências em `localStorage` aplicadas antes da hidratação; shell novo (`AppShell` com barra lateral no desktop e `BarraInferior` no celular); telas novas em `src/routes/` + `src/features/<tela>/`, consumindo as server fns já existentes e as das fases 2–3.

**Tech Stack:** o do projeto (React 19, TanStack, Tailwind v4, shadcn/ui, lucide). Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-05-wakecrm-interface.md`; referências `docs/ref/README.md` e `docs/ref/ui/*.png` (os implementadores **devem abrir as imagens** com a ferramenta de leitura antes de escrever cada tela).

## Global Constraints

- Tema padrão verde; rosa só por escolha; o layout não muda entre temas.
- Nenhuma foto: `Avatar` com iniciais.
- Todas as telas: estados carregando, vazio, erro, sem permissão; mobile primeiro; alvos de toque ≥ 44 px; `aria-label` em ícones; foco visível; `prefers-reduced-motion`.
- Rotas e features não importam `src/server/db.ts`; dados só por server fn.
- Rotas antigas continuam funcionando; só saem da navegação.
- Arquivos acima de 350 linhas: dividir em `src/features/<tela>/`.
- Textos de tela em português do Brasil, iguais aos das referências quando existirem.
- Arquivos do coordenador: `vite.config.ts`, `package.json`, `eslint.config.js`.

## Decisões deste plano

- `src/components/AppSidebar.tsx` é substituído por `src/components/shell/{AppShell,BarraLateral,BarraInferior,MenuUsuario}.tsx`; `__root.tsx` passa a usar `AppShell`.
- Preferências: `src/features/preferencias/preferencias.ts` (`lerPreferencias`, `gravarPreferencias`, `aplicarNoDocumento`), script inline em `__root.tsx`.
- As telas de dinheiro (fase 4) nascem com estado "em breve" lido de uma única fonte: `src/features/dinheiro/disponivel.ts` → `false` até a fase 4 trocar.
- A Task 7 das fases 2–3 (UI de `/aprovar`) e a UI da Task 8 (Ritmo/IA) passam para cá (Tasks 3 e 5 deste plano); lá ficam só os servers.

## Review Focus

1. Trocar tema/densidade e recarregar: nada pisca nem volta ao padrão (Task 1 `preferências antes da hidratação`).
2. Atendente abre `/visao-geral` ou `/configuracoes` por URL → redireciona para `/inicio` (Task 2 `guards`).
3. `/aprovar` com 0 itens e com 40 itens: estado vazio e rolagem com snap sem travar (Task 3).
4. Conversa de lead sem eventos: linha do tempo mostra só "Cadastro realizado" (Task 4 `montarLinhaDoTempo`).
5. Admin desativa um usuário em `/configuracoes` → leads redistribuídos e tabela atualizada sem recarregar (Task 5).

---

### Task 1: Tokens, temas, densidade e preferências

**Files:** Modify `src/styles.css`, `src/routes/__root.tsx`; Create `src/features/preferencias/preferencias.ts`, `src/features/preferencias/preferencias.test.ts`, `src/features/preferencias/SeletorTema.tsx`, `src/features/preferencias/SeletorDensidade.tsx`, `src/features/preferencias/SeletorModo.tsx`, `src/components/ui/avatar-iniciais.tsx` (`AvatarIniciais({ nome, tamanho })` com cor determinística), `src/components/ui/card-degrade.tsx` (`CardDegrade` para KPIs), `src/components/ui/chip-temperatura.tsx`.
**Depends-on:** none.

**Interfaces:** `type Preferencias = { tema: 'verde' | 'rosa'; modo: 'sistema' | 'claro' | 'escuro'; densidade: 'grande' | 'medio' | 'pequeno' }`; `PREFERENCIAS_PADRAO`; `lerPreferencias(storage = localStorage)`, `gravarPreferencias(p)`, `aplicarNoDocumento(p, doc = document)`; `SCRIPT_INLINE` (string aplicada em `<head>` antes da hidratação). Tokens da spec §2.
- [ ] Testes puros: `lerPreferencias` com storage vazio → padrão; JSON inválido → padrão; `aplicarNoDocumento` define `data-tema`, `data-densidade` e `.dark` (modo `sistema` segue `matchMedia`); `corDoAvatar("Tâmara")` estável.
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 2: Shell e navegação

**Files:** Create `src/components/shell/AppShell.tsx`, `BarraLateral.tsx`, `BarraInferior.tsx`, `MenuUsuario.tsx`, `src/components/shell/navegacao.ts` (+ `navegacao.test.ts`), `src/routes/inicio.tsx`, `src/routes/perfil.tsx`, `src/routes/visao-geral.tsx` (esqueleto com guard, conteúdo na Task 6), `src/routes/pipeline.tsx` (esqueleto, Task 7), `src/routes/configuracoes.tsx` (esqueleto, Task 5), `src/routes/equipe.tsx` (esqueleto, Task 5), `src/routes/vendas.tsx` ("em breve" + link para `/reports`); Modify `src/routes/__root.tsx`; Delete `src/components/AppSidebar.tsx`.
**Depends-on:** 1.

**Interfaces:** `navegacao.ts`: `itensDesktopAdmin`, `abasCelularAdmin`, `abasCelularAtendente` (`{ titulo, url, icone }`), `rotaInicial(papel)` (`admin → '/visao-geral'`, `atendente → '/inicio'`); guards: rotas de admin usam `exigirAdmin`; `/inicio`, `/perfil`, `/aprovar` usam `exigirSessao`; `exigirAdmin` redireciona atendente para `/inicio` e `exigirAtendente` admin para `/visao-geral` (ajuste em `src/server/auth.ts` **permitido nesta task**); `/login` redireciona para `rotaInicial`.
- [ ] Testes puros de `navegacao.ts` (itens por papel, `rotaInicial`).
- [ ] `/inicio` do atendente: card "Pode entrar" com `valorEsperado` dos leads dele (ou "em breve" quando `disponivel()` for false para comissão), ações rápidas (Follow-ups com contagem de `listarFilaAprovacao`, Conversas esperando resposta), "Ranking em breve". `/perfil`: nome, usuário, seletores de tema/modo/densidade, instalar app, sair.
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 3: Para avaliar (`/aprovar`)

**Files:** Create `src/routes/aprovar.tsx`, `src/features/aprovacao/CardAprovacao.tsx`, `src/features/aprovacao/FolhaMotivos.tsx`, `src/features/aprovacao/motivos.ts`, `src/features/aprovacao/motivos.test.ts`, `src/features/aprovacao/SugestaoIa.tsx` (caixa reutilizada pela conversa).
**Depends-on:** 1, 2, e `src/server/aprovacao.ts` (fases 2–3, Task 4).
- [ ] Igual à referência 01 (esquerda). Admin: seletor de vendedor (`?vendedor=`). `motivos.ts` com as listas da spec das fases 2–3 §8 e `validarMotivos`; teste puro.
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 4: Conversa com linha do tempo

**Files:** Create `src/features/conversa/Conversa.tsx` (cabeçalho + lista + composer + sugestão), `src/features/conversa/linha-do-tempo.ts`, `src/features/conversa/linha-do-tempo.test.ts`, `src/features/conversa/Bolha.tsx`; Modify `src/routes/index.tsx` (usa `Conversa`; lista de conversas no visual da ref. 05), `src/routes/meus-leads.tsx` (idem, com busca e chips Todas / Não lidas / Follow-ups / Quentes), `src/server/conversas.ts` e `src/server/meus-leads.ts` (expor `eventos` da linha do tempo: `criado_em` do lead, `stage_changed` e `followup_sent` de `v_eventos_automacao_painel`, e o follow-up `aguardando_aprovacao` do lead).
**Depends-on:** 1, 2, 3 (`SugestaoIa`).
- [ ] `montarLinhaDoTempo(eventos)` puro: só fatos existentes; lead sem eventos → só "Cadastro realizado". Filtro das conversas puro (`filtrarConversas`).
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 5: Configurações e operação, Equipe

**Files:** Modify `src/routes/configuracoes.tsx`, `src/routes/equipe.tsx`; Create `src/features/configuracoes/{TamanhoInterface,TemaEModo,Usuarios,ModoFollowup,PrecoHora,StatusWhatsapp,FilaEventos,RespostasRapidasCartao,VendasNaoConciliadas}.tsx`; reutilizar `src/features/admin/*` da fase 1 (MonitorDaFila, PesoEComissao) e `src/features/admin/{Ritmo,PainelIa}.tsx` **criados aqui** (consomem `src/server/admin-ia.ts` das fases 2–3, Task 8).
**Depends-on:** 1, 2; servers `admin-motor.ts` (fase 1), `admin-ia.ts` (fases 2–3 T8), `configuracoes.preco_hora` (fases 2–3 T1).
- [ ] Igual à referência 02. Preço da hora: server fn `definirPrecoHora` em `src/server/admin-ia.ts`? Não — crie `src/server/configuracoes.ts` (`getConfiguracoes`, `definirPrecoHora`; `vite.config.ts` já o exclui) lendo/gravando `configuracoes` pela `painel_rw`.
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 6: Visão geral

**Files:** Modify `src/routes/visao-geral.tsx`; Create `src/features/visao-geral/{Kpis,VendasPorCategoria,PipelinePorEtapa,DesempenhoVendedores,VendasRecentes,AlertasOperacao}.tsx`, `src/server/visao-geral.ts` (`getVisaoGeral({ periodo, vendedorId? })`: pipeline cheio/esperado por etapa via `valorEsperado` sobre `v_leads_painel` + `horas_estimadas` (expor na view? não: ler `leads.horas_estimadas` pelo pool do motor numa query só), alertas (aprovações pendentes = `aguardando_aprovacao`, follow-ups em atraso, falhas da fila), blocos de vendas com `disponivel() === false` → "ainda sem vendas").
**Depends-on:** 1, 2, 5.
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 7: Pipeline

**Files:** Modify `src/routes/pipeline.tsx`; Create `src/features/pipeline/{ColunaEtapa,CardLead,FaixaSomenteLeitura}.tsx`; `src/server/leads.ts` ganha `horasEstimadas` e `valorCheio/valorEsperado` por card (query no pool do motor juntando `leads.horas_estimadas`).
**Depends-on:** 1, 2.
- [ ] Igual à referência 04; clique abre `OpportunityWorkspace`.
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 8: Fechamento visual

**Files:** Modify `docs/design.md`, `docs/architecture.md` (rotas), `README.md`, `public/manifest.webmanifest` (`theme_color` do verde escuro), capturas em `docs/ref/capturas/` (se a skill de navegador estiver disponível).
**Depends-on:** todas.
- [ ] Capturas de cada tela nos dois temas (quando possível) e comparação com as referências; lista do que ainda difere.
- [ ] `bun run check`, `bun run build`, `git diff --check` → exit 0.
