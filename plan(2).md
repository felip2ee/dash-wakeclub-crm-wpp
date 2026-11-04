# PLAN.md — Refatoração do CRM Wake Club

## Objetivo

Refatorar o CRM Wake Club para transformar a experiência atual, fragmentada por módulos técnicos, em uma experiência operacional centralizada em torno da **oportunidade**.

Hoje, informações importantes estão espalhadas entre:

- Kanban / Todos os leads
- Conversas
- IA e Followups / WF-02
- Relatórios
- Admin
- Meus Leads
- Followups da atendente

O objetivo final é que administrador e atendentes consigam entender rapidamente:

1. Quem precisa de atenção agora.
2. Em qual etapa está cada oportunidade.
3. O que aconteceu na conversa.
4. O que cada IA fez.
5. Quais followups foram criados, executados, cancelados ou bloqueados.
6. Qual é o próximo passo esperado.
7. Quem é o responsável pela oportunidade.
8. Se as sugestões da IA foram coerentes.
9. Como está a operação em tempo real.
10. Como está a qualidade das automações.

---

# PRINCÍPIOS DA REFATORAÇÃO

## 1. A oportunidade é o centro do produto

O sistema não deve mais ser organizado pela origem do dado.

Evitar a experiência:

```text
Conversas
Kanban
WF-02
Followups
Relatórios
Admin
```

O usuário não deveria precisar saber onde cada informação foi armazenada.

A experiência deve ser:

```text
Oportunidade
├── dados do lead
├── estágio comercial
├── responsável
├── conversa
├── decisões das IAs
├── followups
├── interações humanas
├── eventos
└── próximo passo
```

---

## 2. Não fazer uma refatoração big-bang

Executar por fases.

Cada fase deve:

- manter o sistema utilizável;
- evitar quebrar endpoints atuais;
- reutilizar dados existentes sempre que possível;
- adicionar novos componentes antes de remover telas antigas;
- manter compatibilidade com os workflows atuais;
- permitir rollback simples.

As telas antigas só devem ser removidas quando a nova experiência já cobrir integralmente suas funções.

---

## 3. Diferenciar estado operacional de auditoria

O usuário comum precisa entender:

- o que está acontecendo;
- o que precisa fazer;
- o que aconteceu antes.

Não deve ser obrigado a entender detalhes técnicos de workflows.

Detalhes técnicos e logs completos podem permanecer disponíveis em uma área avançada de auditoria.

---

## 4. Métricas devem funcionar como controles

Toda métrica operacional importante deve ser clicável.

Exemplo:

```text
7 aguardando equipe
```

Ao clicar:

```text
Kanban filtrado para os 7 leads.
```

Métrica não deve ser apenas decoração.

---

# ESTADO FINAL DESEJADO

## Navegação administrativa

Reduzir progressivamente a navegação principal para aproximadamente:

```text
Central
Inteligência
Equipe
Configurações
```

### Central

Tela operacional principal.

Contém:

- métricas em tempo real;
- filtros;
- Kanban;
- busca;
- alertas;
- abertura do workspace completo da oportunidade.

### Inteligência

Área analítica.

Contém:

- funil;
- volume;
- conversão;
- qualidade de followups;
- desempenho das IAs;
- origem dos leads;
- análise histórica;
- auditoria avançada do WF-02.

### Equipe

Contém:

- atendentes;
- distribuição;
- desempenho;
- tempo de resposta;
- dispositivos;
- permissões;
- saúde operacional.

---

# FASE 0 — MAPEAR O ESTADO ATUAL

## Objetivo

Antes de alterar comportamento, mapear completamente as entidades e fluxos existentes.

## Tarefas

Identificar:

- tabela `leads`;
- tabela `mensagens`;
- tabela `followups`;
- tabela `followup_toques`;
- tabela `crm_outbox`;
- tabelas relacionadas a usuários/atendentes;
- campos de etapa;
- campos de temperatura;
- campos de resumo;
- campos de responsável;
- campos relacionados ao WF-02;
- campos de agendamento;
- qualquer tabela ou coluna relacionada a WhatsApp, Chatwoot ou automações.

Mapear também:

- endpoints utilizados pelo Kanban;
- endpoints da conversa;
- endpoints WF-02;
- endpoints de followups;
- endpoints de relatórios;
- endpoints administrativos.

## Entregável

Adicionar documentação interna em:

```text
docs/architecture.md
```

Contendo:

- entidades;
- relacionamentos;
- endpoints;
- páginas;
- dependências;
- fluxos das automações.

## Critério de aceite

Nenhuma alteração funcional nesta fase.

O sistema deve continuar funcionando exatamente como antes.

---

# FASE 1 — CRIAR O OPPORTUNITY WORKSPACE

## Objetivo

Transformar a abertura de um card do Kanban na principal experiência de investigação de uma oportunidade.

Não remover ainda:

- Conversas;
- WF-02;
- Followups;
- Relatórios.

## Nova experiência

Ao clicar em um card do Kanban, abrir um painel lateral grande ou modal full-screen.

Preferência:

```text
desktop:
70% a 85% da largura

mobile:
100% da tela
```

Nome sugerido do componente:

```text
OpportunityWorkspace
```

---

## Cabeçalho

Mostrar:

```text
Nome do lead
Telefone
Temperatura
Etapa
Responsável
Origem
Última interação
Próximo followup
```

Exemplo:

```text
Mariana Silva

🔥 Quente
Link enviado

Responsável: Ana
Origem: Instagram

Esperando lead há 32 min
Próximo followup: amanhã às 10:30
```

---

## Resumo operacional

Criar uma área de resumo com:

- interesse;
- objeção;
- resumo da IA;
- quantidade de mensagens;
- quantidade de followups;
- quantidade de toques;
- agendamento;
- última ação da equipe;
- próxima ação esperada.

---

## Timeline inicial

Nesta fase, utilizar os dados existentes.

Exibir cronologicamente:

- mensagens do lead;
- mensagens da equipe;
- mensagens da IA;
- followups criados;
- followups cancelados;
- followups enviados;
- alterações de etapa, se disponíveis;
- alterações de temperatura, se disponíveis.

### Filtros

```text
Todos
Mensagens
IA
Followups
Equipe
```

Default:

```text
Todos
```

---

## Componentes sugeridos

```text
src/
  features/
    opportunities/
      OpportunityWorkspace.tsx
      OpportunityHeader.tsx
      OpportunitySummary.tsx
      OpportunityTimeline.tsx
      OpportunityTimelineFilters.tsx
```

Não é obrigatório seguir exatamente essa estrutura se o projeto já possuir outro padrão.

---

## Critérios de aceite

Abrindo qualquer card do Kanban, o administrador consegue visualizar sem sair da tela:

- dados do lead;
- estágio;
- temperatura;
- responsável;
- conversa completa;
- followups;
- principais dados da IA.

Não pode ser necessário abrir:

```text
Conversas
WF-02
```

para entender o contexto básico do lead.

---

# FASE 2 — CRIAR ENDPOINT UNIFICADO DA OPORTUNIDADE

## Objetivo

Evitar que o frontend precise fazer múltiplas chamadas e reconstruir contexto.

Criar um endpoint ou serviço equivalente a:

```text
GET /api/opportunities/:leadId/workspace
```

ou, mantendo o padrão atual do projeto:

```text
getOpportunityWorkspace(leadId)
```

---

## Resposta sugerida

```json
{
  "opportunity": {},
  "lead": {},
  "conversation": [],
  "aiEvents": [],
  "followups": [],
  "touches": [],
  "feedback": [],
  "timeline": [],
  "summary": {}
}
```

---

## Timeline

O backend deve retornar preferencialmente uma timeline já normalizada.

Exemplo:

```json
{
  "id": "event-id",
  "type": "message",
  "actorType": "lead",
  "actorName": "Mariana",
  "occurredAt": "2026-08-11T10:41:00-03:00",
  "data": {}
}
```

Tipos iniciais:

```text
message
followup_created
followup_cancelled
followup_sent
followup_opened
stage_changed
temperature_changed
ai_decision
human_action
```

---

## Critério de aceite

O `OpportunityWorkspace` deve conseguir carregar a maior parte de seu conteúdo através de uma única operação.

---

# FASE 3 — CRIAR AUDITORIA DAS IAs

## Problema atual

Parte do comportamento das IAs é reconstruído através de rastros em:

```text
crm_outbox
followups
leads
mensagens
```

Isso dificulta saber exatamente:

- qual IA agiu;
- quando agiu;
- por quê;
- qual era o estado anterior;
- qual foi a decisão;
- o que mudou.

---

## Objetivo

Criar uma tabela de eventos explícitos das automações.

Nome sugerido:

```text
automation_events
```

---

## Estrutura sugerida

```sql
id

lead_id
opportunity_id nullable

agent_key
event_type

occurred_at

trigger
decision_summary
reason

previous_state jsonb
new_state jsonb
metadata jsonb

source_type
source_id
correlation_id

model nullable
prompt_version nullable

created_at
```

---

## agent_key

Valores possíveis:

```text
qualifier
followup_generator
gatekeeper
sdr
system
```

Não limitar rigidamente caso novos agentes sejam adicionados.

---

## event_type

Exemplos:

```text
lead_qualified
stage_changed
temperature_changed
summary_updated

followup_created
followup_rescheduled
followup_cancelled
followup_blocked
followup_sent

message_generated
message_blocked

assignment_changed
```

---

## Importante

Não armazenar chain-of-thought ou raciocínio interno do modelo.

Salvar apenas:

- decisão operacional;
- justificativa resumida;
- sinais observáveis relevantes;
- estado anterior;
- novo estado;
- metadados técnicos necessários para auditoria.

---

## Exemplo

```json
{
  "agent_key": "qualifier",
  "event_type": "stage_changed",
  "decision_summary": "Lead demonstrou intenção de compra.",
  "reason": "Perguntou preço e disponibilidade para sábado.",
  "previous_state": {
    "stage": "atendimento",
    "temperature": "morno"
  },
  "new_state": {
    "stage": "link_enviado",
    "temperature": "quente"
  }
}
```

---

## Critério de aceite

Ao abrir uma oportunidade deve ser possível distinguir claramente:

```text
Lead
Equipe
Qualificador IA
Gerador de Followup
Porteiro
Sistema
```

---

# FASE 4 — TIMELINE UNIFICADA REAL

## Objetivo

Depois da criação dos eventos das IAs, substituir a reconstrução parcial por uma timeline unificada confiável.

---

## Exemplo

```text
10:41
Mariana
"Quanto fica para fazer a aula eu e meu marido?"

10:42
Qualificador IA

Temperatura:
Morno → Quente

Etapa:
Atendimento → Link enviado

Motivo:
Perguntou preço e demonstrou intenção para sábado.

10:43
IA

Mensagem enviada:
"Claro! Para duas pessoas..."

10:44
Gerador de Followup

Followup criado
Amanhã às 10:30

Motivo:
Aguardando decisão após envio dos valores.
```

---

## Visual

Criar cards diferentes por tipo.

### Mensagem do lead

Avatar ou indicador:

```text
👤 Lead
```

### Equipe

```text
👩 Ana
```

### IA

```text
🤖 Qualificador
🤖 Followup
🛡 Porteiro
```

### Sistema

```text
⚙ Sistema
```

---

## Critério de aceite

Uma pessoa que nunca acompanhou aquela oportunidade deve conseguir entender sua história lendo somente a timeline.

---

# FASE 5 — CENTRAL ADMINISTRATIVA

## Objetivo

Transformar a tela administrativa principal em uma central operacional.

---

## Estrutura

### 1. Cabeçalho

```text
Central de Oportunidades
```

Controles:

```text
Período
Busca
Atualizar
Filtros
```

---

## 2. Métricas operacionais

Mostrar no topo:

```text
Oportunidades ativas
Aguardando equipe
Paradas há 2h+
Followups vencidos
Followups hoje
Leads quentes
Sem responsável
```

---

## Métricas clicáveis

Exemplo:

```text
Followups vencidos: 4
```

Clique:

```text
applyFilters({
  followupStatus: "overdue"
})
```

---

## 3. Filtros do Kanban

Incluir:

```text
Responsável
Etapa
Temperatura
Origem
Status do followup
Tempo sem resposta
Com/sem agendamento
Com/sem responsável
```

Possibilitar combinar filtros.

---

## 4. Kanban

Manter inicialmente o comportamento atual de leitura.

Não implementar drag-and-drop enquanto o conflito entre:

```text
estado da oportunidade
etiqueta do WhatsApp
WF-02
```

não estiver corretamente desacoplado.

---

## Critério de aceite

Em até 5 segundos, o administrador deve conseguir responder:

```text
Quem precisa de atenção agora?
```

---

# FASE 6 — CENTRALIZAR MÉTRICAS

## Objetivo

Trazer para a mesma experiência operacional os principais indicadores atualmente espalhados em:

```text
Admin
Relatórios
WF-02
```

---

## Não transformar a home em dashboard excessivo

Organizar métricas em dois níveis.

### Nível 1 — operação agora

Sempre visível.

```text
ativos
aguardando equipe
followups atrasados
leads quentes
sem responsável
```

### Nível 2 — desempenho

Abaixo do Kanban ou em seção expansível.

```text
Funil
Conversões
Tempo de resposta
Volume de mensagens
Followups
Qualidade da IA
Origem
Equipe
```

---

## Períodos

```text
Hoje
7 dias
30 dias
90 dias
Personalizado
```

---

## Critério de aceite

O usuário não deve precisar navegar até `Relatórios` para consultar os principais indicadores do dia a dia.

---

# FASE 7 — NOVA TELA DA ATENDENTE: MINHA FILA

## Objetivo

Unificar:

```text
Meus leads
Followups
```

em uma experiência orientada a ação.

---

## Nova página

Nome sugerido:

```text
Minha Fila
```

---

## Seções

### Precisa de você agora

Prioridade máxima.

Considerar:

- followups vencidos;
- leads quentes;
- leads esperando equipe;
- lead parado;
- retorno necessário.

---

### Esperando resposta

Leads cujo próximo passo depende do cliente.

---

### Mais tarde

Followups futuros.

---

### Feitos hoje

Ações concluídas pela atendente.

---

## Card sugerido

```text
MARINA ALVES

🔥 Quente
Link enviado

"Vou conversar com meu marido e te aviso"

há 21 horas

Por que estou te mostrando isso?

A cliente demonstrou intenção de compra,
recebeu os valores e não respondeu desde ontem.

Sugestão:
"Oi Marina, conseguiu conversar..."

[Abrir no WhatsApp]

Ver contexto
```

---

## Critério de aceite

A atendente não deve precisar pensar:

```text
Qual lead eu devo chamar agora?
```

O sistema deve priorizar e explicar.

---

# FASE 8 — FEEDBACK DO FOLLOWUP APÓS VOLTAR DO WHATSAPP

## Objetivo

Capturar avaliação humana sobre a qualidade dos followups sugeridos pela IA.

---

## Fluxo

Ao clicar:

```text
Abrir no WhatsApp
```

executar:

1. registrar `followup_toque`;
2. salvar localmente que existe um feedback pendente;
3. abrir WhatsApp.

---

## Persistência temporária

Pode usar:

```text
localStorage
```

ou estado persistente equivalente.

Estrutura:

```json
{
  "followupId": 123,
  "leadId": 456,
  "touchId": 789,
  "openedAt": "..."
}
```

Nome sugerido:

```text
pendingFollowupFeedback
```

---

## Detectar retorno

Avaliar eventos:

```text
visibilitychange
focus
pageshow
```

Também verificar no carregamento inicial da aplicação.

---

## Popup

Perguntar:

```text
Esse followup fez sentido?
```

Opções:

```text
👍 Sim
😐 Mais ou menos
👎 Não
```

---

## Segunda pergunta

Se `Sim`:

```text
O que você fez?

Enviei como estava
Editei e enviei
Não enviei
```

Se `Mais ou menos` ou `Não`:

```text
O que estava errado?

Momento errado
Texto ruim
Contexto errado
Lead já respondeu
Não deveria fazer followup
Outro
```

Campo opcional:

```text
Conte o que você percebeu...
```

---

# FASE 9 — TABELA FOLLOWUP_FEEDBACK

## Estrutura sugerida

```sql
id

followup_id
touch_id
lead_id
attendant_id

coherence
action_taken
reason
comment

created_at
```

---

## coherence

```text
yes
partial
no
```

---

## action_taken

```text
sent_as_is
edited_and_sent
not_sent
unknown
```

---

## reason

```text
wrong_timing
bad_copy
wrong_context
lead_already_replied
should_not_followup
other
```

---

## Importante

Não misturar feedback com:

```text
followups.status
```

Status representa o ciclo de vida operacional.

Feedback representa avaliação humana.

---

# FASE 10 — CICLO DE VIDA DO FOLLOWUP

## Objetivo

Exibir claramente o histórico completo de cada followup.

---

## Eventos possíveis

```text
created
scheduled
rescheduled
opened
sent
cancelled
blocked
feedback_received
```

---

## Componente sugerido

```text
FollowupLifecycle
```

---

## Exemplo

```text
✓ 11/08 13:02 Criado pela IA
│
✓ 11/08 13:02 Programado para 12/08 10:00
│
✓ 12/08 10:01 Disponibilizado para Ana
│
✓ 12/08 10:04 Ana abriu no WhatsApp
│
✓ 12/08 10:09 Enviado
│
└ 12/08 10:11 Feedback: Coerente
```

---

## Cancelamentos

Mostrar sempre o motivo.

Exemplo:

```text
Cancelado

Motivo:
Lead respondeu antes do horário.
```

Nunca apresentar simplesmente:

```text
CANCELADO
```

sem contexto.

---

# FASE 11 — MÉTRICAS DE QUALIDADE DA IA

## Objetivo

Utilizar o feedback das atendentes para medir coerência real das automações.

---

## Indicadores

### Taxa geral de coerência

```text
82%
```

---

### Por tipo

```text
Reengajamento      91%
Lembrete D-1       95%
Pós-aula           88%
Reativação         54%
```

---

### Por agente

```text
Qualificador
Followup Generator
Gatekeeper
```

---

### Por ação

```text
Enviado sem edição
Editado antes de enviar
Não enviado
```

---

### Principais problemas

```text
Momento errado
Texto ruim
Contexto errado
Lead já tinha respondido
Followup desnecessário
```

---

## Critério de aceite

A qualidade da IA não deve ser medida apenas por:

```text
quantidade de followups
abertura
toque
envio
```

Deve existir feedback humano explícito.

---

# FASE 12 — COMPONENTIZAÇÃO DO FRONTEND

## Problema

Existem múltiplas implementações de:

- visualização de conversa;
- cards de lead;
- informações do lead;
- followups;
- indicadores.

Isso aumenta redundância e inconsistência.

---

## Estrutura sugerida

```text
src/
  features/

    opportunities/
      OpportunityBoard
      OpportunityCard
      OpportunityWorkspace
      OpportunityHeader
      OpportunitySummary

    conversation/
      ConversationThread
      MessageBubble

    activity/
      ActivityTimeline
      MessageEvent
      AiDecisionEvent
      FollowupEvent
      HumanEvent
      SystemEvent

    followups/
      FollowupCard
      FollowupLifecycle
      FollowupSuggestion
      FollowupFeedbackModal

    metrics/
      OperationalMetricCard
      MetricsBar
      FunnelChart

    ai/
      AiAgentBadge
      AiDecisionCard

    attendants/
      MyQueue
      QueueCard
```

Adaptar ao padrão arquitetural já existente.

---

## Regra

Antes de criar componente novo, procurar implementações equivalentes no projeto.

Evitar duplicar:

```text
MessageBubble
LeadCard
StatusBadge
TemperatureBadge
```

---

# FASE 13 — SEPARAR CONTATO DE OPORTUNIDADE

## Não executar antes das fases anteriores estarem estáveis.

## Problema

Hoje `lead` tende a representar ao mesmo tempo:

- pessoa;
- oportunidade;
- estado;
- etapa;
- histórico comercial.

Isso limita múltiplos ciclos comerciais.

---

## Modelo futuro

```text
contacts
    │
    ├── conversations
    │
    └── opportunities
            │
            ├── stage
            ├── status
            ├── temperature
            ├── owner
            ├── source
            └── events
```

---

## Exemplo

```text
Mariana Silva
    │
    ├── Oportunidade #1
    │   Aula experimental
    │   Agosto/2026
    │
    └── Oportunidade #2
        Plano mensal
        Janeiro/2027
```

---

## Estratégia de migração

Não substituir `leads` de uma vez.

Criar nova entidade e fazer migração progressiva.

Possível estratégia:

```text
contacts
opportunities
lead_id legacy
```

Manter compatibilidade durante período de transição.

---

# FASE 14 — DESACOPLAR ETAPA DO CRM DA ETIQUETA DO WHATSAPP

## Problema

Atualmente existe risco de conflito porque:

- WF-02 altera etiqueta;
- Kanban interpreta etiqueta como estágio;
- painel não pode alterar livremente sem competir com a automação.

---

## Objetivo

Criar uma fonte de verdade própria para o estágio da oportunidade.

Exemplo:

```text
opportunities.stage_id
```

WhatsApp passa a receber uma representação desse estado, não ser a fonte principal.

---

## Fluxo futuro

```text
Opportunity.stage
        │
        ├── UI
        ├── IA
        └── sincronizador
                │
                └── etiqueta WhatsApp
```

---

## Benefício

Depois disso será possível implementar com segurança:

```text
drag-and-drop no Kanban
```

com regras claras.

---

# FASE 15 — LIMPEZA DE NAVEGAÇÃO

Só realizar quando a Central e Minha Fila estiverem estáveis.

---

## Avaliar remoção da navegação principal

### Conversas

Transformar em:

```text
view secundária
```

ou eliminar se `OpportunityWorkspace` cobrir integralmente.

---

### Todos os Leads

Substituído pela:

```text
Central
```

---

### IA e Followups

Transformar em:

```text
Inteligência > Auditoria
```

---

### Relatórios

Transformar em:

```text
Inteligência
```

---

### Admin antigo

Distribuir funções entre:

```text
Central
Inteligência
Equipe
Configurações
```

---

# NOVA ARQUITETURA DE EXPERIÊNCIA

## Administrador

```text
Central
│
├── métricas operacionais
├── filtros
├── kanban
└── OpportunityWorkspace
        │
        ├── lead
        ├── resumo
        ├── timeline
        ├── conversa
        ├── IA
        ├── followups
        └── próximos passos

Inteligência
│
├── funil
├── conversão
├── followups
├── qualidade da IA
├── origens
└── auditoria

Equipe
│
├── atendentes
├── produtividade
├── tempo de resposta
├── qualidade
└── dispositivos
```

---

# NOVA ARQUITETURA DA ATENDENTE

```text
Minha Fila

├── Precisa de você agora
├── Esperando resposta
├── Mais tarde
└── Feitos hoje
```

Cada item deve explicar:

```text
Quem
Por que apareceu
O que aconteceu
O que fazer
```

---

# PRIORIZAÇÃO VISUAL DOS CARDS

Criar sinais claros.

## Exemplo

```text
🔥 quente
⚠ parado há 2h+
⏰ followup vencido
💬 aguardando lead
👩 aguardando equipe
📅 agendado
🤖 ação da IA pendente
```

Evitar excesso de cores.

Utilizar hierarquia visual consistente.

---

# REGRAS DE UX

## Regra 1

Nunca obrigar o usuário a navegar para outra página apenas para entender o contexto de um lead.

---

## Regra 2

Qualquer status deve responder:

```text
Por quê?
```

Exemplo ruim:

```text
Cancelado
```

Exemplo correto:

```text
Cancelado
Lead respondeu antes do horário.
```

---

## Regra 3

Toda sugestão da IA deve mostrar contexto.

Exemplo:

```text
Sugestão de followup

Por quê:
Cliente recebeu os valores ontem e não respondeu.
```

---

## Regra 4

A interface deve mostrar o próximo passo.

Exemplo:

```text
Próxima ação:
Aguardar até amanhã 10:30.
```

---

## Regra 5

Não misturar logs técnicos com informação operacional.

---

## Regra 6

A interface mobile é prioridade para atendentes.

---

# REQUISITOS MOBILE

A tela `Minha Fila` deve ser mobile-first.

Garantir:

- cards grandes;
- CTA de WhatsApp acessível;
- navegação com uma mão;
- popup de feedback responsivo;
- sem tabelas horizontais;
- informações essenciais visíveis sem abrir detalhes;
- histórico carregado de forma eficiente.

---

# PERFORMANCE

## OpportunityWorkspace

Evitar carregar milhares de mensagens imediatamente.

Implementar:

```text
paginação
infinite scroll
ou load-more
```

---

## Timeline

Ordenar por:

```text
occurred_at DESC
```

na consulta.

No frontend pode inverter visualmente dependendo do design.

---

## Índices

Avaliar índices para:

```text
lead_id
opportunity_id
occurred_at
followup_id
status
agent_key
event_type
responsavel_id
```

---

# OBSERVABILIDADE

Adicionar logs estruturados para operações importantes.

Exemplo:

```text
opportunity_workspace_loaded
followup_opened
followup_feedback_submitted
ai_event_created
followup_cancelled
```

Evitar logs com conteúdo sensível desnecessário.

---

# TESTES

Cada fase deve incluir testes relevantes.

Priorizar:

## Backend

- criação de automation_event;
- montagem da timeline;
- lifecycle de followup;
- feedback;
- filtros;
- oportunidade.

## Frontend

- carregamento do workspace;
- filtros da timeline;
- feedback modal;
- retorno do WhatsApp;
- filtros clicáveis das métricas;
- comportamento mobile.

---

# COMPATIBILIDADE

Durante toda a refatoração:

Não quebrar:

- integração WhatsApp;
- workflows existentes;
- Chatwoot, se utilizado;
- filas;
- agendamentos;
- WF-02;
- followups;
- autenticação;
- permissões;
- relatórios existentes.

---

# O QUE NÃO FAZER

## Não remover telas antigas cedo demais.

## Não refatorar banco inteiro antes de validar a nova UX.

## Não adicionar drag-and-drop antes de resolver a fonte de verdade da etapa.

## Não armazenar chain-of-thought de IA.

## Não considerar "abriu WhatsApp" como "enviou mensagem".

## Não considerar followup cancelado automaticamente como erro.

## Não criar nova implementação de conversa para cada tela.

## Não criar dashboards cheios de números sem ação correspondente.

## Não esconder o motivo de decisões automáticas.

---

# ORDEM RECOMENDADA DE EXECUÇÃO

```text
FASE 0
Mapear arquitetura

↓

FASE 1
OpportunityWorkspace

↓

FASE 2
Endpoint unificado

↓

FASE 3
automation_events

↓

FASE 4
Timeline unificada

↓

FASE 5
Central administrativa

↓

FASE 6
Métricas centralizadas

↓

FASE 7
Minha Fila

↓

FASE 8
Feedback pós-WhatsApp

↓

FASE 9
followup_feedback

↓

FASE 10
Lifecycle visual

↓

FASE 11
Métricas de qualidade da IA

↓

FASE 12
Componentização

↓

FASE 13
Contato x oportunidade

↓

FASE 14
Desacoplar estágio da etiqueta WhatsApp

↓

FASE 15
Limpeza das telas antigas
```

---

# INSTRUÇÕES PARA O CODEX

Executar uma fase por vez.

Antes de iniciar cada fase:

1. Ler os arquivos relacionados.
2. Identificar dependências.
3. Informar quais arquivos serão modificados.
4. Preservar comportamento existente sempre que possível.
5. Evitar alterações fora do escopo.

Após concluir cada fase:

1. Rodar build.
2. Rodar lint.
3. Rodar testes existentes.
4. Corrigir erros introduzidos.
5. Listar arquivos alterados.
6. Resumir decisões arquiteturais.
7. Informar qualquer dívida técnica encontrada.
8. Não iniciar automaticamente a próxima fase se houver risco de quebrar comportamento existente.

---

# DEFINIÇÃO DE PRONTO — PRODUTO

A refatoração estará funcionalmente madura quando:

### Administrador

Ao abrir o sistema consegue responder rapidamente:

```text
Quantas oportunidades existem?
Quem precisa de atenção?
Por quê?
Quem está responsável?
O que aconteceu?
O que a IA fez?
Quais followups existem?
Qual foi cancelado?
Por quê?
Qual é o próximo passo?
```

sem precisar navegar por cinco telas.

### Atendente

Ao abrir o sistema consegue responder:

```text
Quem eu preciso chamar agora?
Por que esse lead é prioridade?
O que aconteceu anteriormente?
O que devo dizer?
```

e consegue dar feedback sobre a recomendação da IA após retornar do WhatsApp.

---

# VISÃO DE PRODUTO

O objetivo final não é apenas reorganizar telas.

É mudar o produto de:

```text
painel técnico que expõe workflows
```

para:

```text
CRM operacional assistido por IA
```

A interface deve esconder a complexidade técnica quando ela não é necessária e expor contexto, decisões e próximos passos quando são importantes.

A pergunta central de cada tela deve ser:

```text
O que está acontecendo e o que eu preciso fazer agora?
```
