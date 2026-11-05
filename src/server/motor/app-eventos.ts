/**
 * Eventos USER_* do app movem o funil (spec 2026-11-05 §3, §4, §6, §13).
 *
 * Existe para que cadastro, compra, agendamento e aula mudem etapa, saldo de horas e
 * lembretes de aula do lead sem IA, com idempotência em `app_eventos (tipo, chave)` e o
 * evento de automação no mesmo comando que muda o dado. Roda na transação do chamador
 * (o processador `vendas` da fila); evento de teste nunca chega aqui.
 */
import { randomUUID } from "node:crypto";

import type { PoolClient } from "../db";
import { proximaEtapa, type TipoEventoApp } from "../../lib/etapas";
import type { EventoApp, PessoaApp } from "../vendas/eventos-app";
import { cruzar } from "./vendas";

type Resultado = "aplicado" | "hora_sem_saldo" | "saldo_desconhecido";
type Origem = { appEventoId: string | null; correlacao: string; gatilho: "webhook" | "admin" };
type Mudanca = {
  tipo: TipoEventoApp;
  ocorridoEm: string | null;
  horas?: number | null;
  aulaEm?: string;
  atendidaEm?: string;
};

/** Lead do evento: app_user_id, depois CPF, depois telefone. Completa app_user_id e CPF vazios. */
async function localizarLead(db: PoolClient, p: PessoaApp): Promise<string | null> {
  let leadId: string | null = null;
  if (p.userId) {
    const { rows } = await db.query<{ id: string }>(
      "select id from wakeclub.leads where app_user_id = $1::text",
      [p.userId],
    );
    leadId = rows[0]?.id ?? null;
  }
  leadId ??= (await cruzar(db, p))?.leadId ?? null;
  if (!leadId) return null;
  await db.query(
    `update wakeclub.leads
        set app_user_id = coalesce(app_user_id, $2::text), cpf = coalesce(cpf, $3::text)
      where id = $1::uuid
        and ((app_user_id is null and $2::text is not null) or (cpf is null and $3::text is not null))
        and not exists (select 1 from wakeclub.leads o
                         where o.app_user_id = $2::text and o.id <> $1::uuid)`,
    [leadId, p.userId, p.cpf],
  );
  return leadId;
}

const SQL_APLICAR = `
with antes as (
  select id, etiqueta, saldo_horas from wakeclub.leads where id = $1::uuid
),
mov as (
  update wakeclub.leads l
     set etiqueta = coalesce($3::text, l.etiqueta),
         saldo_horas = case when $5::boolean then $4::integer else l.saldo_horas end,
         proxima_aula_em = case
           when $2::text = 'agendamento' and $7::timestamptz > now()
             then least(coalesce(l.proxima_aula_em, $7::timestamptz), $7::timestamptz)
           when $2::text = 'aula' and l.proxima_aula_em <= $8::timestamptz then null
           else l.proxima_aula_em end,
         ultima_aula_em = case when $2::text = 'aula'
           then greatest(l.ultima_aula_em, $8::timestamptz) else l.ultima_aula_em end,
         ultimo_evento_app_em = greatest(l.ultimo_evento_app_em, $6::timestamptz),
         pagamento_pendente_desde = case $2::text
           when 'compra_pendente' then $6::timestamptz
           when 'compra_paga' then null
           else l.pagamento_pendente_desde end
    from antes a
   where l.id = a.id
  returning l.id, l.etiqueta, l.saldo_horas, a.etiqueta as etiqueta_antes,
            a.saldo_horas as saldo_antes
),
-- Evento do app tira o lead de "parado": cancela o follow-up comum aberto; lembrete fica.
cancelados as (
  update wakeclub.followups f
     set status = 'cancelado', motivo_cancelamento = 'evento do app: ' || $2::text
    from wakeclub.followups a
   where a.id = f.id and f.lead_id = $1::uuid
     and f.status in ('pendente', 'aguardando_aprovacao', 'aprovado')
     and f.tipo not in ('lembrete_d1', 'lembrete_dia')
  returning f.id, f.lead_id, f.tipo, f.agendado_para, f.motivo_cancelamento,
            a.status as status_antes
),
notificacoes_canceladas as (
  update wakeclub.notificacoes n
     set status = 'cancelada', erro = c.motivo_cancelamento
    from cancelados c
   where n.followup_id = c.id and n.status = 'pendente'
  returning n.id
),
registro as (
  update wakeclub.app_eventos set lead_id = $1::uuid, resultado = $9::text
   where id = $10::text::bigint
  returning id
),
eventos as (
  insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo,
     metadados, entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
  select m.id, 'app', 'stage_changed', $11::text, 'etapa movida por evento do app', $2::text,
         jsonb_build_object('etiqueta', m.etiqueta_antes), jsonb_build_object('etiqueta', m.etiqueta),
         '{}'::jsonb, 'lead', m.id, 'motor', $10::text, $12::text
    from mov m where m.etiqueta is distinct from m.etiqueta_antes
  union all
  select m.id, 'app', 'hours_balance_changed', $11::text, 'saldo de horas mudou', $2::text,
         jsonb_build_object('saldo_horas', m.saldo_antes),
         jsonb_build_object('saldo_horas', m.saldo_horas),
         '{}'::jsonb, 'lead', m.id, 'motor', $10::text, $12::text
    from mov m where m.saldo_horas is distinct from m.saldo_antes
  union all
  select m.id, 'app', 'class_booked', $11::text, 'aula agendada no app', null,
         '{}'::jsonb, jsonb_build_object('aula_em', $7::timestamptz),
         '{}'::jsonb, 'lead', m.id, 'motor', $10::text, $12::text
    from mov m where $2::text = 'agendamento'
  union all
  select m.id, 'app', 'lesson_without_balance', $11::text, 'aula sem desconto de hora', $9::text,
         jsonb_build_object('saldo_horas', m.saldo_antes), '{}'::jsonb,
         jsonb_build_object('atendida_em', $8::timestamptz), 'lead', m.id, 'motor',
         $10::text, $12::text
    from mov m where $2::text = 'aula' and $9::text <> 'aplicado'
  union all
  select c.lead_id, 'app', 'followup_cancelled', $11::text, 'cancelado por evento do app',
         c.motivo_cancelamento,
         jsonb_build_object('status', c.status_antes, 'tipo', c.tipo,
                            'agendado_para', c.agendado_para),
         jsonb_build_object('status', 'cancelado'),
         '{}'::jsonb, 'followup', c.id, 'motor', $10::text, $12::text
    from cancelados c
  on conflict do nothing
  returning id
)
select (select count(*) from mov)::int as n`;

/** Aplica a mudança de um evento no lead, num só comando. Devolve o resultado gravado. */
async function aplicar(db: PoolClient, leadId: string, m: Mudanca, o: Origem): Promise<Resultado> {
  const { rows } = await db.query<{ etiqueta: string; saldo_horas: number | null }>(
    "select etiqueta, saldo_horas from wakeclub.leads where id = $1::uuid for update",
    [leadId],
  );
  const atual = rows[0];
  if (!atual) throw new Error("Lead não encontrado.");
  const saldo = atual.saldo_horas;
  let resultado: Resultado = "aplicado";
  let saldoNovo = saldo;
  if (m.tipo === "compra_paga") {
    // Compra sem horas deixa o saldo desconhecido (spec §13).
    saldoNovo = m.horas === null || m.horas === undefined ? null : (saldo ?? 0) + m.horas;
  } else if (m.tipo === "aula") {
    if (saldo === null) resultado = "saldo_desconhecido";
    else if (saldo <= 0) resultado = "hora_sem_saldo";
    else saldoNovo = saldo - 1;
  }
  await db.query(SQL_APLICAR, [
    leadId,
    m.tipo,
    proximaEtapa(atual.etiqueta, m.tipo, saldoNovo),
    saldoNovo,
    saldoNovo !== saldo,
    m.ocorridoEm,
    m.aulaEm ?? null,
    m.atendidaEm ?? null,
    resultado,
    o.appEventoId,
    o.gatilho,
    o.correlacao,
  ]);
  return resultado;
}

const SQL_LEMBRETES = `
with alvo as (
  select tipo, greatest(nominal, now()) as agendado_para
    from (values
      ('lembrete_d1',
       (((($2::timestamptz at time zone 'America/Sao_Paulo')::date - 1) + time '10:00')
         at time zone 'America/Sao_Paulo')),
      ('lembrete_dia',
       ((($2::timestamptz at time zone 'America/Sao_Paulo')::date + time '08:00')
         at time zone 'America/Sao_Paulo'))
    ) v (tipo, nominal)
   where $2::timestamptz - now() >= interval '2 hours'
),
criado as (
  insert into wakeclub.followups (lead_id, tipo, agendado_para, motivo, aula_em, status)
  select $1::uuid, a.tipo, a.agendado_para,
         'aula em ' || to_char($2::timestamptz at time zone 'America/Sao_Paulo',
                               'YYYY-MM-DD HH24:MI')
           || coalesce(' (' || $3::text || ')', ''),
         $2::timestamptz, 'pendente'
    from alvo a
   where not exists (
     select 1 from wakeclub.followups f
      where f.lead_id = $1::uuid and f.tipo = a.tipo
        and f.status in ('pendente', 'aguardando_aprovacao', 'aprovado', 'enviando'))
  returning id, lead_id, tipo, agendado_para, motivo
)
insert into wakeclub.eventos_automacao
  (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo,
   metadados, entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
select c.lead_id, 'app', 'followup_created', 'webhook',
       c.tipo || ' em ' || to_char(c.agendado_para at time zone 'America/Sao_Paulo',
                                   'YYYY-MM-DD HH24:MI'),
       c.motivo, '{}'::jsonb,
       jsonb_build_object('tipo', c.tipo, 'agendado_para', c.agendado_para, 'status', 'pendente'),
       '{}'::jsonb, 'followup', c.id, 'motor', $4::text, 'motor:app:' || $4::text
  from criado c
on conflict do nothing`;

/** Lembretes "amanhã" (10h do dia anterior) e "hoje" (8h) da aula, só com 2 h ou mais de antecedência. */
async function criarLembretes(
  db: PoolClient,
  leadId: string,
  ev: Extract<EventoApp, { tipo: "agendamento" }>,
  appEventoId: string,
): Promise<void> {
  await db.query(SQL_LEMBRETES, [leadId, ev.aulaEm, ev.modalidade, appEventoId]);
}

export async function processarEventoApp(
  db: PoolClient,
  ev: EventoApp,
  corpoBruto: unknown,
): Promise<"processado" | "ignorado"> {
  const { rows } = await db.query<{ id: string }>(
    `insert into wakeclub.app_eventos (tipo, chave, ocorrido_em, dados)
     values ($1::text, $2::text, $3::timestamptz, $4::jsonb)
     on conflict (tipo, chave) do nothing
     returning id::text`,
    [ev.tipo, ev.chave, ev.ocorridoEm, JSON.stringify(corpoBruto)],
  );
  const appEventoId = rows[0]?.id;
  if (!appEventoId) return "ignorado"; // reentrega

  const leadId = await localizarLead(db, ev.pessoa);
  if (!leadId) {
    await db.query("update wakeclub.app_eventos set resultado = 'sem_lead' where id = $1::bigint", [
      appEventoId,
    ]);
    return "processado";
  }
  await aplicar(
    db,
    leadId,
    {
      tipo: ev.tipo,
      ocorridoEm: ev.ocorridoEm,
      horas: "horas" in ev ? ev.horas : null,
      aulaEm: "aulaEm" in ev ? ev.aulaEm : undefined,
      atendidaEm: ev.tipo === "aula" ? ev.atendidaEm : undefined,
    },
    { appEventoId, correlacao: `motor:app:${appEventoId}`, gatilho: "webhook" },
  );
  if (ev.tipo === "agendamento" && Date.parse(ev.aulaEm) > Date.now())
    await criarLembretes(db, leadId, ev, appEventoId);
  return "processado";
}

/** Mesma regra da compra paga do app, para a venda ligada pelo admin (sem `app_eventos`). */
export async function avancarPorVendaVinculada(
  db: PoolClient,
  leadId: string,
  horas: number | null,
): Promise<void> {
  await aplicar(
    db,
    leadId,
    { tipo: "compra_paga", ocorridoEm: null, horas },
    { appEventoId: null, correlacao: `motor:venda-vinculada:${randomUUID()}`, gatilho: "admin" },
  );
}
