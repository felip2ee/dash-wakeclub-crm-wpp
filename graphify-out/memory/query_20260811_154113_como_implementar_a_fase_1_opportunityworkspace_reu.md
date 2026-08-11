---
type: "query"
date: "2026-08-11T15:41:13.966321+00:00"
question: "Como implementar a Fase 1 OpportunityWorkspace reutilizando os dados atuais?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["src_features_opportunities_opportunityworkspace_opportunityworkspace", "src_routes_kanban_carddolead", "src_server_conversas_getmensagens", "src_server_wf02_getwf02atividade", "src_server_wf02_getfollowups"]
---

# Q: Como implementar a Fase 1 OpportunityWorkspace reutilizando os dados atuais?

## Answer

CardDoLead abre OpportunityWorkspace; o workspace combina getMensagens, getWf02Atividade e getFollowups em timeline filtrável. A normalização fica em src/features/opportunities/timeline.ts. As leituras admin chamam exigirAdmin no servidor.

## Outcome

- Signal: useful

## Source Nodes

- src_features_opportunities_opportunityworkspace_opportunityworkspace
- src_routes_kanban_carddolead
- src_server_conversas_getmensagens
- src_server_wf02_getwf02atividade
- src_server_wf02_getfollowups