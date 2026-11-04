# Workflows n8n legados

Exportações dos workflows que moviam o CRM até agosto de 2026, copiadas em 04/11/2026 de
`~/Downloads/wakeclubcrm · *.json`. Todas estão com `active: false`. Servem de fonte para
portar lógica, SQL e prompts para o WakeCRM; **nunca reative nenhum deles**: dois motores
escrevendo no mesmo lead brigam (design do WakeCRM, §2).

As credenciais aparecem só como referência (id e nome da credencial do n8n), sem segredo.

| Arquivo | Workflow | Destino no WakeCRM |
|---|---|---|
| `db-setup.json` | DDL do schema `wakeclub` | `db/migrations/0001_base.sql` (fase 1) |
| `wf-01-ingestor-evolution.json` | ingestor do webhook Evolution | `src/server/motor/ingestao.ts` (fase 1) |
| `wf-07-saude-do-numero.json` | ack, conexão e heartbeat | `src/server/motor/saude.ts` (fase 1) |
| `wf-08-distribuicao-de-leads.json` | rodízio pegajoso por menor carga | `src/server/motor/distribuicao.ts`, agora por peso (fase 1) |
| `wf-08-labels-e-distribuicao.json` | variante com labels do WhatsApp | descartado (design §3) |
| `wf-09-notificacoes-push.json` | fila `notificacoes` → push | `src/server/motor/notificacoes.ts` (fase 1) |
| `wf-11-transcritor-de-audio.json` | transcrição de áudio | fase 2 |
| `wf-02-qualificador-ia.json` | qualificador | fase 2 (prompts portados literalmente) |
| `wf-03-redator-de-followup.json` | porteiro e redator | fase 3 (prompts portados literalmente) |
| `console-sql.json`, `console-evolution.json` | ferramentas manuais de diagnóstico | só referência |
