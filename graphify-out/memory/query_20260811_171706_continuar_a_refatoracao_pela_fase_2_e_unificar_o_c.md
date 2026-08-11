---
type: "query"
date: "2026-08-11T17:17:06.733503+00:00"
question: "Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace"
contributor: "graphify"
outcome: "useful"
source_nodes: ["src_server_opportunities_getopportunityworkspace", "src_features_opportunities_opportunityworkspace_opportunityworkspace", "src_server_opportunities_montartimeline"]
---

# Q: Continuar a refatoracao pela Fase 2 e unificar o carregamento do OpportunityWorkspace

## Answer

Expanded from original query via vocab: atividade, create, followups, mensagem, mensagens, query, server, timeline. OpportunityWorkspace agora chama apenas getOpportunityWorkspace. A server function valida admin, reutiliza getMensagens, getWf02Atividade e getFollowups, filtra o lead e devolve timeline normalizada.

## Outcome

- Signal: useful

## Source Nodes

- src_server_opportunities_getopportunityworkspace
- src_features_opportunities_opportunityworkspace_opportunityworkspace
- src_server_opportunities_montartimeline