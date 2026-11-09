# WakeCRM · Wake Club

## Problema e objetivo

A Wake Club é uma escola de wakeboard e wakesurf em Palmas que vende pelo WhatsApp,
num número único da empresa. O atendimento é humano. Sem acompanhamento, lead que
perguntou preço ou recebeu link esfria. O produto mantém o CRM preenchido a partir das
conversas, distribui os leads entre a equipe, sugere follow-ups escritos por IA e mostra
o funil em dinheiro.

**Estado em 05/11/2026:** as fases 1 a 4 estão **implementadas localmente e não publicadas**:
motor próprio no lugar do n8n (fila, ingestão, distribuição, saúde, push), IA de volta
(transcrição, qualificação com horas estimadas, porteiro e redator), follow-up com aprovação
humana e modos de ritmo, interface nova (temas verde e rosa, densidade, telas das
referências) e dinheiro (vendas por webhook, categorias, comissão, fechamento do dia 10).
O n8n segue parado e não volta.

**Bloqueios:**

- A virada depende da **captura dos eventos reais do Evolution Go** (Task 13 da fase 1;
  publicar o endpoint é o que permite capturar). Sem o adaptador, o webhook só grava o corpo
  bruto e envio, mídia, transcrição e heartbeat ficam desligados.
- Sem **`OPENAI_API_KEY`** nada é qualificado, redigido nem transcrito (as tarefas ficam
  ociosas). A chave é custo e exige decisão do dono.
- O **formato do webhook de vendas é provisório**: o normalizador é tolerante e registra
  cada suposição; precisa ser calibrado com o payload real do sistema de vendas.

Nada disso foi validado em produção nem em aparelho real. Design:
`docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md` e as specs das fases
seguintes em `docs/superpowers/specs/`.

## Público e papéis

- `admin`: vê todas as conversas, o funil, os relatórios e administra a equipe.
- `atendente` (vendedor): vê só os leads atribuídos a ele, pela PWA no celular.

Só existem esses dois papéis. "Super admin" é a área de configuração do `admin`.

## Fluxos que existem hoje

- Login por papel (admin vai para `/visao-geral`, atendente para `/inicio`), PWA e push.
- **Admin:** Visão geral (KPIs em reais, categorias, pipeline por etapa, ranking, alertas),
  Pipeline (somente leitura, valor cheio e esperado), Conversas (`/`), Follow-ups
  (`/aprovar`, todas as filas), Vendas e comissões (`/vendas`: vendas, vendas sem dono,
  fechamento do mês), Equipe (peso e comissão) e Configurações e operação (usuários, modo
  de follow-up, preço da hora, status do WhatsApp, fila de eventos, painel de IA). As telas
  antigas (`/kanban`, `/wf02`, `/reports`, `/admin`, `/templates`) seguem acessíveis por URL.
- **Atendente (vendedor):** Início (`/inicio`: pode entrar, garantida no mês, a pagar dia
  10, ranking da semana), Conversas dos seus leads (`/meus-leads`), "Para avaliar"
  (`/aprovar`: Enviar ou Não enviar a sugestão da IA, com motivo) e Perfil. `/followups`
  e `/minha-fila` (abrir o WhatsApp com o texto pronto) seguem por URL.
- **Motor:** a IA qualifica o lead e sugere o follow-up; um humano aprova; o motor envia na
  janela das 8h às 19h59 respeitando cota e intervalo do modo (conservador 20/dia e 120 s,
  aquecido 60/dia e 45 s até a meia-noite). Vendas entram por webhook, cruzam com o lead
  (CPF, depois telefone) e são categorizadas pela janela de 48 h.

Detalhes, rotas e permissões: `docs/architecture.md`.

## Próxima entrega

Em ordem:

1. Capturar os eventos reais do Evolution Go (Task 13), escrever o adaptador (com
   `ErroEnvio` tipado e timeout bem abaixo de 15 min) e validar envio e mídia em aparelho
   real; calibrar o webhook de vendas com o payload real.
2. Publicar e fazer a virada (`docs/runbook-virada.md`): `db:migrate` aplica 0003, 0004 e
   0005 juntas no corte.
3. Configurar `OPENAI_API_KEY` e acompanhar as primeiras rodadas de IA no painel de IA.
4. Validar PWA, push e envio em iPhone; revisão visual com login real.

## O que precisa do dono

Decisões parqueadas (o código segue o padrão anotado ao lado até o dono decidir):

- **Regex de opt-out:** hoje determinística (`ehOptOut`); confirmar a lista de expressões
  antes de a IA começar a mexer nos leads.
- **Expirar `aprovado` com mais de 24 h:** sem adaptador (ou fora da janela) os aprovados
  acumulam; hoje nenhum follow-up expira por tempo.
- **Ordem das colunas do Pipeline:** segue o funil do CRM, não a ordem da imagem de
  referência; o dono pode pedir a da imagem.
- **Ranking top 3 com medalhas:** hoje o ranking lista todos os vendedores ativos; o top 3
  em destaque da referência não foi feito.
- **Chave da OpenAI** (custo) e **autorização para publicar** e aplicar o corte.
- **Percentuais de comissão** por vendedor (`usuarios.comissao_pct`) e o **preço da hora**
  (hoje 360): conferir antes de ligar.
- Texto editado pelo vendedor antes de enviar não passa pela validação de links e emoji
  (ele é o autor); confirmar que é o desejado.

## Fora de escopo

- Arrastar card no Kanban: só a IA move etapa.
- Mais de um número de WhatsApp. IA respondendo o lead sem humano.
- Importar o histórico do período parado (fica para um agente depois).

## Requisitos permanentes

- Português do Brasil, fuso `America/Sao_Paulo`, mobile primeiro para o atendente.
- Vendedor nunca vê lead, conversa ou comissão de outro (exceto o ranking semanal).
- Nenhum follow-up sai sem um humano tocar "Enviar".
- Segredos só no `.env`; `usuarios.senha_hash` nunca sai do servidor.

## Restrições técnicas

TanStack Start, React 19, Bun, PostgreSQL `wakeclub` via `pg` sem ORM, Docker no
GHCR com Swarm/Portainer. Sem Drizzle por escolha: o schema já existe e é SQL puro;
revisitar só se a manutenção de migrações virar problema.

## Pendências

- Formato real dos eventos do Evolution Go (Task 13, bloqueia a virada) e do webhook de
  vendas (provisório).
- `OPENAI_API_KEY` (IA desligada sem ela).
- Validação em aparelho real de PWA, push e envio.
- Dívidas conhecidas, por tema, nos handoffs dos planos em `docs/superpowers/plans/`.

## Histórico da refatoração por oportunidades

Movido do antigo `AGENTS.md` em 04/11/2026. Descreve a refatoração de `plan(2).md`,
anterior à decisão de trocar o n8n.

### Mandato atual

Este repositório entra agora na refatoração descrita em `plan(2).md`.

“Começar do zero” significa começar pela **Fase 0 do plano**, sem presumir que alguma
fase nova está pronta. Não significa apagar o app, recriar a stack, zerar banco ou
descartar telas que já funcionam. O sistema atual é a linha de base que a refatoração
deve preservar até cada substituição ter sido validada.

Estado atual da refatoração:

- **Fase 0 concluída:** `docs/architecture.md` registra entidades, views,
  server functions, páginas, permissões e fluxos n8n existentes;
- **Fases 1 e 2 implementadas localmente:** o Kanban abre o `OpportunityWorkspace`,
  que recebe mensagens, atividade do WF-02, followups e timeline por uma única
  `getOpportunityWorkspace`; ainda requer validação visual com login real;
- **Fase 7 implementada localmente por autorização explícita fora da ordem:**
  `/minha-fila` unifica carteira e followup atual pelas views existentes, prioriza e
  explica cada card; `/followups` e `/meus-leads` continuam disponíveis;
- as **Fases 3–6 não devem ser presumidas concluídas**: banco/n8n seguem sob trabalho de
  outro agente e a integração só avança após o relatório dessa entrega;
- a Fase 7 ainda requer validação visual com login real e teste do retorno do WhatsApp
  em aparelho; “Feitos hoje” enxerga somente toques ainda presentes em
  `v_followups_fila`, pois não existe view histórica própria para a atendente;
- nenhuma mudança funcional pertenceu à Fase 0.

Execute uma fase por vez. Não avance automaticamente para a próxima fase quando houver
dependência externa, decisão de produto pendente ou risco de alterar comportamento.

### Produto que estamos construindo

A oportunidade passa a ser o centro da experiência. O administrador deve responder
“quem precisa de atenção agora e por quê?” pela Central e investigar todo o contexto no
`OpportunityWorkspace`. A atendente deve receber uma fila mobile priorizada que explique
quem chamar, por que o item apareceu e qual é o próximo passo.

A navegação final `Central / Inteligência / Equipe / Configurações` é um destino, não
uma migração imediata. Preserve `/`, `/kanban`, `/wf02`, `/reports`, `/admin`,
`/followups` e `/meus-leads` até a nova experiência cobrir e validar suas funções.

Métricas operacionais são controles: quando representam uma população, devem aplicar o
filtro correspondente. Não adicione números decorativos nem misture logs técnicos à
visão operacional.

### Leitura prática das fases

- **Fase 0:** documentar o estado real; zero mudança funcional.
- **Fases 1–2:** abrir o workspace a partir do Kanban reutilizando leituras atuais e,
  depois, consolidar a maior parte da carga em uma única `createServerFn`. Admin pode
  ler qualquer lead; atendente só lead atribuído, validado no servidor.
- **Fases 3–4:** criar auditoria no domínio do n8n/banco e então uma timeline unificada
  confiável. Não reconstruir como fato o que o banco não registra.
- **Fases 5–6:** evoluir o Kanban existente para Central e conectar métricas a filtros;
  não remover telas antigas.
- **Fases 7–11:** unificar a fila mobile, feedback e lifecycle sem perder a distinção
  sugestão → abertura → eco confirmado → avaliação humana.
- **Fase 12:** extrair componentes compartilhados comprovadamente duplicados.
- **Fases 13–14:** migrar contato/oportunidade e fonte de etapa progressivamente, com
  compatibilidade e rollback. Só depois considerar drag-and-drop.
- **Fase 15:** remover navegação antiga apenas após paridade funcional demonstrada.

## Manutenção

Atualize este documento quando objetivo, escopo, restrições ou critérios mudarem.
Decisões técnicas e evidência ficam em `docs/architecture.md` e `docs/setup.md`.
