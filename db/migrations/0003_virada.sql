-- 0003 · Corte na virada para o motor próprio. Aplicada SÓ no momento do corte
-- (antes disso: `bun run db:migrate -- --ate 0002`). Ver docs/runbook-virada.md.
--
-- O n8n está parado desde agosto: os follow-ups pendentes e os `qualificar_apos`
-- que ficaram são lixo de um motor morto. Cancela tudo, zera tudo, e deixa um
-- evento de auditoria por entidade, no mesmo comando da mudança. `atendente_id`
-- não é tocado. Idempotente: reexecutar não acha mais nada para mudar, e o
-- correlacao_id por entidade barra evento duplicado.

-- Follow-ups pendentes viram cancelados; notificações pendentes ligadas a
-- follow-up viram canceladas (ninguém deve receber push de follow-up antigo).
with cancelados as (
  update wakeclub.followups f
     set status = 'cancelado',
         motivo_cancelamento = 'virada: follow-up do motor antigo cancelado no corte'
   where f.status = 'pendente'
  returning f.id, f.lead_id, f.tipo, f.agendado_para, f.motivo_cancelamento
),
notificacoes_canceladas as (
  update wakeclub.notificacoes n
     set status = 'cancelada',
         erro = 'virada: follow-up do motor antigo cancelado no corte'
   where n.status = 'pendente' and n.followup_id is not null
  returning n.id
)
insert into wakeclub.eventos_automacao
  (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
   estado_anterior, estado_novo, entidade_tipo, entidade_id,
   origem_tipo, origem_id, correlacao_id)
select c.lead_id, 'sistema', 'followup_cancelled', 'virada', 'cancelado na virada',
       c.motivo_cancelamento,
       jsonb_build_object('status', 'pendente', 'tipo', c.tipo,
                          'agendado_para', c.agendado_para),
       jsonb_build_object('status', 'cancelado'),
       'followup', c.id, 'motor', '0003_virada', 'virada:' || c.id::text
  from cancelados c
on conflict do nothing;

-- Zera `qualificar_apos` de todos os leads que tinham valor.
with antes as (
  select id, qualificar_apos from wakeclub.leads where qualificar_apos is not null
),
zerados as (
  update wakeclub.leads l
     set qualificar_apos = null
    from antes a
   where l.id = a.id
  returning l.id, a.qualificar_apos as anterior
)
insert into wakeclub.eventos_automacao
  (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
   estado_anterior, estado_novo, entidade_tipo, entidade_id,
   origem_tipo, origem_id, correlacao_id)
select z.id, 'sistema', 'qualification_cleared', 'virada', 'qualificação zerada na virada',
       'virada: fila de qualificação do motor antigo descartada no corte',
       jsonb_build_object('qualificar_apos', z.anterior),
       jsonb_build_object('qualificar_apos', null),
       'lead', z.id, 'motor', '0003_virada', 'virada:' || z.id::text
  from zerados z
on conflict do nothing;
