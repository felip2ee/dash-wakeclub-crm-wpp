# WakeCRM · fase 4 · vendas, categorias, comissão e painéis em dinheiro

> Spec escrita em 04/11/2026 a partir do design `2026-11-03-wakecrm-motor-proprio-design.md`
> §8, §9 e §10 item 4. **[design]** = decidido lá; **[construtor]** = decisão desta spec,
> tomada com autonomia concedida pelo dono, revisável. O formato real do webhook de vendas só
> será conhecido no envio de teste **[design §8.1]**: tudo que depende dele nasce
> **provisório** e marcado como tal.

## 1. Objetivo

Receber vendas por webhook, cruzar com o lead, categorizar, calcular comissão por vendedor,
fechar o mês no dia 10 e mostrar o funil em dinheiro (Visão geral, Pipeline, painel do
vendedor, ranking semanal).

## 2. Webhook de vendas (provisório) **[construtor]**

- `POST /api/webhooks/vendas` já grava bruto (fase 1). O processador `vendas` da fila usa
  um **normalizador provisório** `src/server/vendas/normalizar.ts` que procura, por nomes
  comuns e de forma tolerante, os campos de §8.1: id da venda (`id`, `order_id`,
  `transaction`), data/hora (`created_at`, `data`, `paid_at`), valor (`amount`, `valor`,
  `price`; centavos quando inteiro > 1000 sem casas decimais → decisão registrada por evento),
  CPF (`cpf`, `document`, `buyer.document`), telefone (`phone`, `telefone`, `buyer.phone`),
  produto/horas (`product`, `produto`, `plan`, `horas`), status (`status`: paga/aprovada/
  estornada/refunded/chargeback). Campo não encontrado → `null`; sem id ou sem valor → o
  evento fica `falhou` com erro "formato desconhecido" (visível no monitor) para a
  calibração com o payload real.
- O app de agendamento envia o próprio envelope `{ event, timestamp, data }`. Só
  `USER_HOUR_PURCHASE_PAID` cria venda: id = `data.transaction_id` (senão `payment_id`), valor =
  `data.price_paid` **em reais** (sem heurística de centavos), data = `timestamp`, produto =
  `package_label` (senão `<hours>h <hour_type>`). `data.test === true` e os demais eventos
  (`USER_CREATE_ACCOUNT`, `USER_HOUR_BOOKED`, `USER_LESSON_ATTENDED`,
  `USER_HOUR_PURCHASE_CREATED`, `USER_CONTRACT_SIGNED`) terminam `ignorado`, não `falhou`. Ainda
  não há evento de estorno nem movimentação de etapa do lead por esses eventos.
- Idempotência por `(origem_externa, id_externo)` único em `vendas`.

## 3. Tabela `vendas` (migração `0005_vendas.sql`) **[construtor]**

`vendas (id uuid pk, origem_externa text not null default 'webhook', id_externo text not
null, comprada_em timestamptz not null, valor numeric(12,2) not null, cpf text, telefone
text, produto text, horas smallint, status text check in ('paga','estornada') default 'paga',
lead_id uuid references leads, vendedor_id uuid references usuarios, comissao_pct
numeric(5,2), comissao_valor numeric(12,2), categoria text check in ('follow-up',
'atendimento','recompra','espontanea'), categoria_motivo text, vinculada_por text check in
('cpf','telefone','admin'), estornada_em timestamptz, fechamento_id uuid, corpo_bruto jsonb,
criado_em, atualizado_em)`; `unique (origem_externa, id_externo)`; `leads.cpf text` com
índice; `fechamentos (id uuid pk, vendedor_id, mes date (1º dia), total_vendas, total_comissao,
ajustes numeric default 0, pago_em timestamptz, pago_por uuid, criado_em)` único por
`(vendedor_id, mes)`; `lancamentos_comissao (id, vendedor_id, venda_id, fechamento_id,
valor numeric(12,2), motivo text, criado_em)` para estornos de mês já pago.

## 4. Cruzamento e categoria **[design §8.2, §8.3]**

- Ordem: CPF (`leads.cpf`), senão telefone normalizado (`paraE164`); ao casar por telefone,
  grava o CPF no lead. Sem casamento → `lead_id null` ("vendas sem dono"); admin vincula na
  mão (`vincularVenda`, `vinculada_por 'admin'`), o que dispara categoria e comissão.
- Categoria (janela 48h antes de `comprada_em`): 1) follow-up `enviado` do lead nas 48h →
  `follow-up`; 2) mensagem da equipe (`direcao 'equipe'`, qualquer `enviada_por`) nas 48h →
  `atendimento`; 3) nenhuma interação e já havia venda `paga` anterior do lead → `recompra`;
  4) senão → `espontanea`. `categoria_motivo` guarda o id do follow-up ou da mensagem.
- Comissão só para `follow-up` e `atendimento`: `vendedor_id = leads.atendente_id` e
  `comissao_pct = usuarios.comissao_pct` **no momento da venda**, gravados na venda.
- Tudo num comando com evento `sale_received` / `sale_linked` / `sale_refunded`
  (`entidade_tipo 'venda'` → CHECK ganha `'venda'`).

## 5. Estorno **[design §8.4]**

`status = 'estornada'`, `estornada_em`. Se a venda está num mês ainda não pago → sai do
cálculo. Se o mês já foi pago → `lancamentos_comissao` negativo no próximo fechamento do
mesmo vendedor, visível para ele e para o admin. Provisório até o payload real dizer como
chega o estorno.

## 6. Fechamento no dia 10 **[design §8.4 + construtor]**

- Server fn `getFechamento({ mes })` (admin): por vendedor, vendas comissionáveis do mês
  (`comprada_em` no mês em São Paulo, `status 'paga'`), soma de comissão, ajustes (lançamentos
  pendentes), total a pagar; `marcarPago({ vendedorId, mes })` cria/atualiza `fechamentos`
  com `pago_em`, vincula as vendas (`fechamento_id`) e consome os lançamentos. Mês pago fica
  congelado (vendas novas atrasadas do mês pago viram lançamento positivo no próximo).
- Alerta na Visão geral a partir do dia 10: "Comissão a pagar: fechar mês anterior".

## 7. Painéis em dinheiro **[design §9]**

- `src/server/dinheiro.ts`: `getResumoDinheiro({ periodo, vendedorId? })` → pipeline cheio
  e esperado (via `valorEsperado`, `preco_hora` de `configuracoes`), vendido no período, vendas
  por categoria (valor e quantidade), comissão a pagar no dia 10 (mês anterior não pago),
  vendas recentes, ranking por vendedor no período.
- Painel do vendedor (`/inicio`): "Pode entrar" = esperado dos leads ativos dele × %;
  "Garantida no mês" = comissão das vendas comissionáveis do mês corrente; "A pagar dia 10" =
  mês anterior; ranking semanal (segunda a domingo, São Paulo) por valor comissionável —
  única visão de outro vendedor **[design §9.3]**.
- `src/features/dinheiro/disponivel.ts` passa a `true`; as telas da interface trocam os
  estados "em breve" pelos dados.
- Vendas e comissões `/vendas` (admin): lista de vendas com filtros, vendas sem dono com
  "Vincular a um lead", fechamento do mês com "Marcar pago".

## 8. Fora de escopo

Recalibrar chances; nota fiscal; múltiplas origens de venda além do webhook; importar
histórico.

## 9. Testes

Normalizador provisório (campos alternativos, centavos, ausência), cruzamento CPF/telefone,
categoria (os quatro ramos, janela 48h), comissão congelada na venda, estorno antes/depois
do fechamento, fechamento e marcação de pago, ranking semanal e "pode entrar".
