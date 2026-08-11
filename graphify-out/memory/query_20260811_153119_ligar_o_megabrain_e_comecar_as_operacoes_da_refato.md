---
type: "query"
date: "2026-08-11T15:31:19.401046+00:00"
question: "Ligar o megabrain e comecar as operacoes da refatoracao pela Fase 0"
contributor: "graphify"
outcome: "useful"
source_nodes: ["HistoricoDoLead()", "getMensagens", "FollowupsPage()", "listarMinhaFila", "AdminPage()", "getPainelAdmin", "getPool()", "getPoolRw()"]
---

# Q: Ligar o megabrain e comecar as operacoes da refatoracao pela Fase 0

## Answer

Expanded from original query via vocab: [route, server, pool, views, auth, lead, followup, conversa, admin, push, kanban, relatorios]. A Fase 0 mapeou a arquitetura atual em docs/current-architecture.md: TanStack Start usa server functions e dois pools, o painel le 16 views, o n8n e dono do CRM, e o banco real confirmou roles, views e dados. HistoricoDoLead/getMensagens, FollowupsPage/listarMinhaFila e AdminPage/getPainelAdmin sao os principais pontos de reutilizacao para a Fase 1.

## Outcome

- Signal: useful

## Source Nodes

- HistoricoDoLead()
- getMensagens
- FollowupsPage()
- listarMinhaFila
- AdminPage()
- getPainelAdmin
- getPool()
- getPoolRw()