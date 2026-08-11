---
type: "explain"
date: "2026-08-11T17:21:20.225930+00:00"
question: "O que precisa ser feito no n8n para a Fase 3?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["plan_2_fase_3_criar_auditoria_das_ias"]
---

# Q: O que precisa ser feito no n8n para a Fase 3?

## Answer

Instrumentar atomicamente WF-02 e WF-03 no primeiro corte, gravando automation_events no mesmo SQL das mutacoes. Depois cobrir os eventos sistemicos de WF-01 e WF-08. Registrar decisao operacional, motivo curto, estados anterior/novo, workflow/execution/correlation, modelo e versao do prompt; nunca cadeia de pensamento. Usar idempotencia e iniciar o historico na data da ativacao, sem inventar backfill.

## Outcome

- Signal: useful

## Source Nodes

- plan_2_fase_3_criar_auditoria_das_ias