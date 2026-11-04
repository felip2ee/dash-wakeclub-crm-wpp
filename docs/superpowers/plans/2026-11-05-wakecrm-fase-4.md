# WakeCRM fase 4 · dinheiro · Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vendas por webhook cruzadas com o lead, categorizadas, com comissão por vendedor, fechamento no dia 10 e painéis em dinheiro.

**Architecture:** processador `vendas` na fila (normalizador provisório → `vendas`), regras puras de categoria/comissão testadas sem banco, server fns de dinheiro reutilizando `valorEsperado`, telas da interface trocando "em breve" por dados.

**Tech Stack:** o do projeto. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-05-wakecrm-fase-4-dinheiro.md` (autoridade), sobre o design §8–§9.

## Global Constraints

- Tudo das fases anteriores. O formato do webhook é **provisório**: o normalizador é tolerante e marca `falhou` o que não entende; nada é inventado como fato.
- Comissão só `follow-up` e `atendimento`; `%` e vendedor congelados na venda.
- Período/mês/semana sempre em `America/Sao_Paulo` no SQL.
- Vendedor nunca vê venda/comissão de outro, exceto o ranking semanal.
- Arquivos do coordenador: `vite.config.ts` (já exclui `src/server/vendas.ts`, `src/server/dinheiro.ts`), `package.json`, `eslint.config.js`.

## Review Focus

1. Mesma venda reenviada pelo webhook → uma linha, uma comissão (Task 2 `idempotente`).
2. Venda sem CPF e telefone em formato local sem 9º dígito → casa pelo `paraE164` (Task 2 `telefone normalizado`).
3. Follow-up enviado há 47h59 vs 48h01 → categoria muda (Task 1 `janela 48h limites`).
4. Estorno de venda de mês pago → lançamento negativo, nunca altera o fechamento pago (Task 3 `estorno pós-pagamento`).
5. Vendedor pede ranking → vê nomes e valores dos colegas, mas `getResumoDinheiro` de outro vendedor é recusado (Task 4 `posse do resumo`).

---

### Task 1: Migração 0005 e regras puras

**Files:** Create `db/migrations/0005_vendas.sql`, `src/server/vendas/normalizar.ts`, `src/server/vendas/normalizar.test.ts`, `src/server/vendas/regras.ts`, `src/server/vendas/regras.test.ts`, `src/server/motor/migracoes-0005.db.test.ts`.
**Depends-on:** fases 2–3 Task 1 (0004).
**Interfaces:** `normalizarVenda(corpo: unknown): VendaNormalizada | { erro: string }` com `VendaNormalizada = { idExterno, compradaEm (ISO), valor (reais), cpf | null, telefone | null, produto | null, horas | null, status: 'paga' | 'estornada', decisoes: string[] }`; `categoriaDaVenda(i: { compradaEm: Date; followupEnviadoEm: Date | null; mensagemEquipeEm: Date | null; tinhaVendaAnterior: boolean }): { categoria; motivo }`; `comissaoDaVenda(valor, pct, categoria): number` (0 para recompra/espontânea; arredonda a 2 casas).
- [ ] Puros: normalizador (campos alternativos; `amount: 36000` inteiro → 360,00 com decisão registrada; `status: 'refunded'` → estornada; sem id → erro); `janela 48h limites`; comissão.
- [ ] Banco: 0005 aplica duas vezes; `vendas` rejeita categoria inválida; unique `(origem_externa, id_externo)`.

### Task 2: Processador de vendas, cruzamento e vínculo manual

**Files:** Create `src/server/motor/vendas.ts`, `src/server/motor/vendas.db.test.ts`, `src/server/vendas.ts` (server fns admin: `listarVendas`, `listarVendasSemDono`, `vincularVenda({ vendaId, leadId })`, `estornarVenda({ vendaId })` para o caso de o webhook não trazer estorno); Modify `src/server/motor/iniciar.ts` (processador `vendas`).
**Depends-on:** 1.
**Interfaces:** `processarVenda(db, v: VendaNormalizada, corpoBruto): Promise<{ vendaId; nova: boolean }>` (cruza, categoriza, comissão, eventos); `vincular(db, vendaId, leadId, adminId)`.
- [ ] Banco: `idempotente`, `cruza por cpf`, `telefone normalizado`, `grava cpf no lead ao casar por telefone`, `sem casamento fica sem dono`, `vinculo manual categoriza e comissiona`, `categoria follow-up quando followup enviado nas 48h`, `estorno via webhook`.

### Task 3: Fechamento do dia 10 e lançamentos

**Files:** Create `src/server/fechamento.ts`, `src/server/fechamento.db.test.ts`.
**Depends-on:** 2.
**Interfaces:** `calcularFechamento(db, mes: 'AAAA-MM')` → por vendedor; `marcarPago({ vendedorId, mes })`; `estornoPosFechamento(db, vendaId)` chamado por `processarVenda` quando a venda já tem `fechamento_id`.
- [ ] Banco: `fechamento soma só comissionáveis pagas do mês`, `marcar pago congela`, `estorno pós-pagamento vira lançamento negativo`, `venda atrasada de mês pago vira lançamento positivo`.

### Task 4: Resumo em dinheiro e painel do vendedor

**Files:** Create `src/server/dinheiro.ts`, `src/server/dinheiro.db.test.ts`; Modify `src/features/dinheiro/disponivel.ts` (→ `true`).
**Depends-on:** 2, 3.
**Interfaces:** `getResumoDinheiro({ periodo: { de, ate }, vendedorId? })` (admin qualquer; atendente só o próprio: `posse do resumo`), `getPainelVendedor()` (pode entrar, garantida, a pagar dia 10, ranking semanal), `getRankingSemanal()`.
- [ ] Banco: `pode entrar = esperado × %`, `garantida no mês`, `a pagar dia 10 = mês anterior não pago`, `ranking semanal segunda a domingo SP`, `posse do resumo`.

### Task 5: Telas de dinheiro

**Files:** Modify `src/routes/vendas.tsx`, `src/routes/visao-geral.tsx`, `src/routes/inicio.tsx`, `src/routes/pipeline.tsx` e as features correspondentes (`src/features/visao-geral/*`, `src/features/dinheiro/*`, `src/features/configuracoes/VendasNaoConciliadas.tsx`).
**Depends-on:** 4 e o plano da interface (Tasks 5–7).
- [ ] Referências 02 (vendas não conciliadas), 03 (KPIs, categorias, ranking, vendas recentes), 05 (Meu painel, ranking). `/vendas`: lista, sem dono com "Vincular a um lead", fechamento com "Marcar pago".
- [ ] `bun run check`, `bun run build` → exit 0.

### Task 6: Docs e runbook

**Files:** Modify `docs/architecture.md`, `docs/runbook-virada.md` (captura do webhook de vendas e calibração do normalizador), `PRODUCT.md`, este plano (handoff).
- [ ] `bun run check`, `bun run test:db`, `bun run build`, `git diff --check` → exit 0.
