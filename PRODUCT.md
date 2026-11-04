# WakeCRM · Wake Club

## Problema e objetivo

A Wake Club é uma escola de wakeboard e wakesurf em Palmas que vende pelo WhatsApp,
num número único da empresa. O atendimento é humano. Sem acompanhamento, lead que
perguntou preço ou recebeu link esfria. O produto mantém o CRM preenchido a partir das
conversas, distribui os leads entre a equipe, sugere follow-ups escritos por IA e mostra
o funil em dinheiro.

**Estado em 04/11/2026:** o motor atual (workflows n8n) está parado. O painel continua
no ar como espelho do banco, mas sem dados novos. A próxima entrega troca o n8n pelo
próprio app (WakeCRM), conforme
`docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md`.

## Público e papéis

- `admin`: vê todas as conversas, o funil, os relatórios e administra a equipe.
- `atendente` (vendedor): vê só os leads atribuídos a ele, pela PWA no celular.

Só existem esses dois papéis. "Super admin" é a área de configuração do `admin`.

## Fluxos que existem hoje

- Login por papel, PWA instalável e push.
- `/` conversas, `/kanban` funil por etapa, `/reports`, `/wf02` auditoria da IA e
  `/admin` (admin).
- `/minha-fila`, `/followups` e `/meus-leads` (atendente): fila priorizada e sugestão de
  follow-up que abre o WhatsApp com o texto pronto.

Detalhes, rotas e permissões: `docs/architecture.md`.

## Próxima entrega (WakeCRM, planejado, não implementado)

Em ordem, segundo o design:

1. Atendimento pelo app via Evolution Go, fila de webhooks no Postgres, distribuição por
   peso e lead "pra sempre" do vendedor.
2. IA de volta: transcrição e qualificação.
3. Follow-up com fila de aprovação estilo Reels e modos de ritmo (conservador/aquecido).
4. Vendas por webhook, categorias (follow-up, atendimento, recompra, espontânea),
   comissão paga no dia 10 e painéis em dinheiro.

## Fora de escopo

- Arrastar card no Kanban: só a IA move etapa.
- Mais de um número de WhatsApp. IA respondendo o lead sem humano.
- Importar o histórico do período parado (fica para um agente depois).

## Requisitos permanentes

- Português do Brasil, fuso `America/Sao_Paulo`, mobile primeiro para o atendente.
- Vendedor nunca vê lead, conversa ou comissão de outro (exceto o ranking semanal
  planejado).
- Nenhum follow-up sai sem um humano tocar "Enviar".
- Segredos só no `.env`; `usuarios.senha_hash` nunca sai do servidor.

## Restrições técnicas

TanStack Start, React 19, Bun, PostgreSQL `wakeclub` via `pg` sem ORM, Docker no
GHCR com Swarm/Portainer. Sem Drizzle por escolha: o schema já existe e é SQL puro;
revisitar só se a manutenção de migrações virar problema.

## Pendências

- Formato real dos eventos do Evolution Go e do webhook de vendas (capturados na fase 1
  e na fase 4).
- Validação em aparelho real de PWA, push e envio.

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
