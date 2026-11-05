# WakeCRM · Visão geral comercial

Data: 05/11/2026. Status: rascunho para aprovação do dono.

## 1. Intenção

A Visão geral deve responder, de cara, **"o comercial está indo bem?"**: estamos vendendo o
suficiente, está chegando lead novo, de onde ele vem e quanto dele vira venda. Gestão de
aulas, agenda e pacotes fica no app de vendas da Wake; o CRM mostra o comercial.

Os gráficos e o valor do pipeline saem da Visão geral e ficam só na aba **Pipeline**.

## 2. O que o dono disse (decidido)

- Meta: **2 vendas por dia**.
- Origem do lead importa: anúncio ou não, e qual.
- Conversão por **coorte**: quem chegou no período e comprou **até hoje** conta como
  convertido daquele período (chegou em junho, comprou em julho → conversão de junho).
- Pipeline (valor e gráficos por etapa) vai para a aba Pipeline.

## 3. Evidência sobre origem (verificada em produção, 05/11/2026)

O WhatsApp marca por onde a conversa começou, e a Evolution 2.3.7 repassa isso na mensagem
(`contextInfo` / `messageContextInfo`): `entryPointConversionSource` e
`entryPointConversionApp`; mensagens vindas de anúncio "Clique para o WhatsApp" trazem também
`externalAdReply` (título, `sourceId` do anúncio, `sourceUrl`, `ctwaClid`). Histórico da
instância `wakeclub` no banco da Evolution (desde abr/2026, mensagens recebidas):

| Origem | App | Mensagens | Com anúncio |
|---|---|---|---|
| `ctwa_ad` | instagram | 14 | 14 |
| `ctwa_ad` | facebook | 3 | 3 |
| `click_to_chat_link` | (vazio / instagram) | ~102 | 1 |
| `global_search_new_chat` | whatsapp | 7 | 0 |
| `phone_number_hyperlink`, `message_short_link`, `group_member_list` | — | 4 | 0 |
| sem marca | — | 7731 | 60 |

Só a **primeira** mensagem de uma conversa costuma carregar a marca.

## 4. Objetivos

1. **Origem do lead** gravada no lead (colunas novas em `wakeclub.leads`, via migração):
   `origem_canal` (ver tabela abaixo), `origem_app` (instagram/facebook/whatsapp/null),
   `origem_anuncio_id`, `origem_anuncio_titulo`, `origem_detectada_em`. Preenchida pelo motor
   na criação do lead a partir da primeira mensagem que trouxer a marca; nunca sobrescrita por
   uma marca posterior (a primeira origem vale). Mapeamento:
   - `anuncio` ← `ctwa_ad` ou presença de `externalAdReply` com `sourceType` de anúncio;
   - `link` ← `click_to_chat_link`, `phone_number_hyperlink`, `message_short_link`;
   - `busca` ← `global_search_new_chat`;
   - `outro` ← qualquer outra marca conhecida (ex. `group_member_list`);
   - `direto` ← sem marca (contato salvo, número digitado, lead antigo).
   O campo `leads.origem` (texto livre, existente) não muda.
2. **Preenchimento retroativo** da origem dos leads existentes a partir do banco da Evolution
   (mensagem recebida mais antiga de cada telefone com marca), por um script one-shot
   idempotente e só leitura na Evolution, escrevendo só as colunas novas. Executado pelo
   instalador ou à mão, com autorização do dono.
3. **Visão geral** (período: hoje / 7 dias / mês / personalizado; padrão: mês corrente), com
   comparação ao período anterior de mesmo tamanho:
   1. **Vendas × meta**: vendas pagas no período, meta = 2 × dias do período (dias corridos),
      % atingido, projeção de fechamento do mês no ritmo atual (só quando o período é o mês
      corrente), faturamento.
   2. **Leads novos**: leads criados no período (primeira mensagem do lead no período).
   3. **Leads novos que compraram** e **taxa de conversão por coorte**: dos leads criados no
      período, quantos têm venda paga vinculada em qualquer data até hoje.
   4. **Vendas para clientes existentes** (recompra/novo pacote): vendas do período cujo lead
      foi criado antes do período — separado para não inflar a conversão.
   5. **Por origem**: para cada `origem_canal` (e app quando anúncio): leads novos, compraram,
      conversão, faturamento da coorte. Em "Anúncio", lista por anúncio (título; id quando não
      houver título).
   6. **Atendimento**: tempo mediano até a primeira resposta da equipe dos leads novos do
      período e quantos leads novos estão sem resposta agora.
4. **Meta configurável** em Configurações (`configuracoes.meta_vendas_dia`, número, padrão 2).
5. **Pipeline**: os blocos "Pipeline cheio", "Estimativa realista" e o gráfico por etapa saem
   da Visão geral e ficam na aba Pipeline (que já tem pipeline); nada se perde.

## 5. Não-objetivos

- Gestão de aulas, agenda, pacotes, presença (app de vendas da Wake).
- Custo de anúncio, CPL, ROAS: exigem dados do Gerenciador de Anúncios (fora do CRM agora).
- Mover etapas do lead por eventos do app (decisão pendente do dono, separada).
- Atribuição multi-toque: vale a primeira origem.

## 6. Anti-objetivos

- Contar evento de teste do app como venda (já ignorado pelo normalizador).
- Conversão inflada por recompra de cliente antigo.
- Inventar origem: sem marca é `direto`, nunca chute.
- Expor a vendedores números de outros vendedores além do que hoje já é exposto (a Visão
  geral continua só para admin).

## 7. Restrições

- Postgres 14; migração nova numerada; casts explícitos; só `src/server/db.ts` importa `pg`.
- Fuso `America/Sao_Paulo` para dias e meses (meta por dia corrido local).
- Venda ↔ lead já é feita por CPF/telefone no processador de vendas (fase 4); a coorte usa
  `vendas.lead_id`. Vendas sem lead vinculado contam em "Vendas" mas não na conversão.
- Leitura pelo pool do motor ou views, seguindo o padrão atual de `visao-geral.ts`.

## 8. Decisões minhas (revisáveis pelo dono)

- **Lead novo** = lead cuja **primeira mensagem recebida do lead** (`min(mensagens.enviada_em)
  where direcao = 'lead'`) cai no período. Lead que só recebeu mensagem da equipe e nunca
  respondeu não entra até responder. `leads.criado_em` não é usado (o upsert também cria lead
  quando a equipe inicia, e leads importados têm a data da importação).
- **O que fica na Visão geral além dos blocos novos:** "Alertas da operação" e "Desempenho dos
  vendedores" ficam. "Comissão a pagar dia 10", "Vendas por categoria" e "Vendas recentes" vão
  para a aba **Vendas**. "Pipeline cheio", "Estimativa realista" e "Pipeline por etapa" vão para
  a aba **Pipeline**.
- **Filtro por vendedor** continua: coorte de leads por `leads.atendente_id` (dono atual);
  vendas por `vendas.vendedor_id` (congelado na venda).
- **Preenchimento retroativo da origem:** script manual (`bun run db:origem`, só leitura no banco
  `evolution`, escreve só as colunas novas de `wakeclub.leads`, idempotente), rodado com
  autorização do dono; não entra no instalador. Sem marca encontrada → `direto`.
- **Comparação com o período anterior** vale para vendas, faturamento, leads novos e
  atendimento; **não** para a conversão por coorte (a coorte anterior teve mais tempo para
  converter; a tela mostra só o valor atual).
- Meta = `meta_vendas_dia` × dias corridos do período (inclui hoje); projeção = vendas ÷ dias
  decorridos × dias do mês; mediana de primeira resposta só para leads cuja primeira mensagem é
  deles; `meta_vendas_dia` criada na migração com `on conflict do nothing` e grant como
  `preco_hora`; `sourceType === 'ad'` em `externalAdReply` conta como anúncio.
- A redefinição das etapas do pipeline (etapa × sinal "parado", eventos do app movendo etapas)
  é um design separado em andamento; esta tela usa as etapas como estiverem.

## 9. Fica para o construtor

- Layout dos blocos (seguir `docs/design.md` e as referências de `docs/ref/ui/`), estados
  carregando/vazio/erro, mobile primeiro.
- Como ler o banco da Evolution no preenchimento retroativo (conexão separada só leitura via
  `ADMIN_DATABASE_URL` no mesmo Postgres, banco `evolution`, ou via contêiner do instalador).
- Índices necessários para as consultas por período.
