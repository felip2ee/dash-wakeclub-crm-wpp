/**
 * Qualificador: porta do WF-02 do n8n (docs/n8n-legado/wf-02-qualificador-ia.json) para o
 * motor, mais `horas_estimadas` (spec fases 2-3 §4). Reivindica leads vencidos, pede a
 * qualificação à IA, valida em código e grava ficha e eventos (follow-up é do sinal "parado").
 * O SQL e as regras de "Montar prompt do lead"/"Validar decisao da IA" são os do legado.
 */
import { randomUUID } from "node:crypto";

import { etiquetaDaIa } from "../../lib/etapas";
import { comTransacao, getPoolMotor, type PoolClient } from "../db";
import { SCHEMA, SISTEMA, VERSAO_PROMPT } from "../ia/prompts/qualificador";
import type { ClienteIa } from "../ia/tipos";
import { logErro } from "../log";

const MODELO = "gpt-5.4-mini";

export type LinhaLead = {
  lead_id: string;
  telefone: string;
  nome: string | null;
  etiqueta: string | null;
  origem: string | null;
  interesse: string | null;
  objecao: string | null;
  temperatura: string | null;
  resumo: string | null;
  n_toques: number | null;
  data_agendada_local: string | null;
  agora_local: string;
  minimo_local: string;
  limite_local: string;
  min_desde_lead: number | null;
  min_desde_equipe: number | null;
  historico: { quem: string; em: string | null; texto: string | null }[];
};

export type Qualificacao = {
  etiqueta: string;
  interesse: string;
  objecao: string;
  temperatura: string;
  dataAgendada: string;
  resumo: string;
  justificativa: string;
  followup: null;
  horasEstimadas: number;
};

type Contexto = { etiquetaAtual: string };

function ou(v: unknown, alt: string): string {
  if (v === null || v === undefined || v === "") return alt;
  return String(v);
}

/** Literal do nó "Montar prompt do lead": ficha atual + conversa (até 40 mensagens). */
export function montarPromptLead(l: LinhaLead): string {
  const hist = Array.isArray(l.historico) ? l.historico : [];
  let conversa = "";
  for (const m of hist) {
    let quem = "IA";
    if (m.quem === "lead") quem = "LEAD";
    if (m.quem === "equipe") quem = "EQUIPE";
    conversa =
      conversa + "[" + ou(m.em, "?") + "] " + quem + ": " + ou(m.texto, "(sem texto)") + "\n";
  }
  if (!conversa) conversa = "(nenhuma mensagem registrada)\n";

  const ficha =
    "AGORA: " +
    ou(l.agora_local, "?") +
    " (America/Sao_Paulo)\n" +
    "Nao agende followup antes de " +
    ou(l.minimo_local, "?") +
    " nem depois de " +
    ou(l.limite_local, "?") +
    ".\n" +
    "\n" +
    "FICHA ATUAL DO LEAD\n" +
    "nome: " +
    ou(l.nome, "(desconhecido)") +
    "\n" +
    "etiqueta: " +
    ou(l.etiqueta, "Novo lead") +
    "\n" +
    "origem: " +
    ou(l.origem, "(nao sei)") +
    "\n" +
    "interesse: " +
    ou(l.interesse, "(nao sei)") +
    "\n" +
    "objecao: " +
    ou(l.objecao, "(nao sei)") +
    "\n" +
    "temperatura: " +
    ou(l.temperatura, "(nao sei)") +
    "\n" +
    "data agendada: " +
    ou(l.data_agendada_local, "(nenhuma)") +
    "\n" +
    "resumo anterior: " +
    ou(l.resumo, "(nenhum)") +
    "\n" +
    "followups enviados sem resposta: " +
    ou(l.n_toques, "0") +
    "\n" +
    "minutos desde a ultima mensagem do lead: " +
    ou(l.min_desde_lead, "(nunca falou)") +
    "\n" +
    "minutos desde a ultima mensagem da equipe: " +
    ou(l.min_desde_equipe, "(nunca falou)") +
    "\n" +
    "\n" +
    "CONVERSA (mais antiga primeiro)\n";

  return ficha + conversa;
}

const TEMPERATURAS = ["quente", "morno", "frio"];
const CARIMBO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/** "AAAA-MM-DD HH:MI" que existe no calendário: 2026-02-30 ou 25:61 não passam. */
export function carimboValido(s: string): boolean {
  if (!CARIMBO.test(s)) return false;
  const [a, m, d, h, min] = s.split(/[- :]/).map(Number);
  return new Date(Date.UTC(a, m - 1, d, h, min)).toISOString().slice(0, 16) === s.replace(" ", "T");
}

function texto(v: unknown, max: number): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s || s === "null" || s === "undefined") return "";
  return s.slice(0, max);
}

/** Literal do nó "Validar decisao da IA", mais `horas_estimadas` (inteiro, 1..8, default 1). */
export function validarQualificacao(cru: unknown, ctx: Contexto): Qualificacao | { erro: string } {
  if (!cru || typeof cru !== "object") return { erro: "a IA nao devolveu objeto" };
  const c = cru as Record<string, unknown>;

  const etiqueta = etiquetaDaIa(texto(c.etiqueta, 60), ctx.etiquetaAtual);

  let temperatura = texto(c.temperatura, 20).toLowerCase();
  if (TEMPERATURAS.indexOf(temperatura) === -1) temperatura = "";

  const resumo = texto(c.resumo, 2000);
  if (!resumo) return { erro: "a IA nao devolveu resumo" };

  let dataAgendada = texto(c.data_agendada, 16);
  if (dataAgendada && !carimboValido(dataAgendada)) dataAgendada = "";

  const h = c.horas_estimadas;
  const horasEstimadas = Number.isInteger(h) ? Math.min(8, Math.max(1, h as number)) : 1;

  return {
    etiqueta,
    interesse: texto(c.interesse, 500),
    objecao: texto(c.objecao, 500),
    temperatura,
    dataAgendada,
    resumo,
    // Auditoria (§18). Vazio e aceito: campo novo nunca derruba qualificacao.
    justificativa: texto(c.justificativa_curta, 300),
    // O sinal "parado" decide o follow-up; o que a IA devolver aqui é descartado.
    followup: null,
    horasEstimadas,
  };
}

const SQL_REIVINDICAR = `
with vencidos as (
  select id
    from wakeclub.leads
   where qualificar_apos is not null
     and qualificar_apos <= now()
     and opt_out = false
     and sem_atendimento = false
   order by qualificar_apos
   limit 8
   for update skip locked
),
-- Lease de 15 min, não null: se o processo cair no meio da IA, o lead volta sozinho.
-- Devolvido em texto para a comparação exata (microssegundos) na gravação.
reivindicados as (
  update wakeclub.leads l
     set qualificar_apos = now() + interval '15 minutes'
    from vencidos v
   where l.id = v.id
  returning l.qualificar_apos::text as lease, l.id, l.telefone, l.nome, l.etiqueta, l.origem, l.interesse,
            l.objecao, l.temperatura, l.resumo, l.data_agendada,
            l.ultima_msg_lead_em, l.ultima_msg_equipe_em, l.n_toques
)
select r.id as lead_id,
       r.lease,
       r.telefone,
       r.nome,
       r.etiqueta,
       r.origem,
       r.interesse,
       r.objecao,
       r.temperatura,
       r.resumo,
       r.n_toques,
       to_char(r.data_agendada at time zone 'America/Sao_Paulo',
               'YYYY-MM-DD HH24:MI') as data_agendada_local,
       to_char(now() at time zone 'America/Sao_Paulo',
               'YYYY-MM-DD HH24:MI') as agora_local,
       to_char((now() + interval '30 minutes') at time zone 'America/Sao_Paulo',
               'YYYY-MM-DD HH24:MI') as minimo_local,
       to_char((now() + interval '30 days') at time zone 'America/Sao_Paulo',
               'YYYY-MM-DD HH24:MI') as limite_local,
       round(extract(epoch from (now() - r.ultima_msg_lead_em)) / 60)::int
         as min_desde_lead,
       round(extract(epoch from (now() - r.ultima_msg_equipe_em)) / 60)::int
         as min_desde_equipe,
       (select coalesce(json_agg(json_build_object(
                 'quem', h.direcao,
                 'em', to_char(h.enviada_em at time zone 'America/Sao_Paulo',
                               'YYYY-MM-DD HH24:MI'),
                 'texto', h.texto) order by h.enviada_em), '[]'::json)
          from (select m.direcao, m.enviada_em, m.texto
                  from wakeclub.mensagens m
                 where m.lead_id = r.id
                 order by m.enviada_em desc
                 limit 40) h) as historico
  from reivindicados r`;

// Só mexe se o lease ainda é o desta rodada: mensagem que chegou durante a IA (+2 min) fica.
const SQL_REAGENDAR = `
update wakeclub.leads
   set qualificar_apos = case when qualificar_apos = $2::timestamptz
                              then now() + interval '10 minutes'
                              else qualificar_apos end
 where id = $1::uuid
   and opt_out = false`;

// "Gravar qualificacao" do legado, com correlacao 'motor:qual:<rodada>:<id>', origem 'motor',
// horas_estimadas e o cancelamento de aguardando_aprovacao/aprovado (spec §5).
const SQL_GRAVAR = `
with antes as (
  select id, etiqueta, temperatura, interesse, objecao, data_agendada
    from wakeclub.leads
   where id = $1::uuid
),
atualizado as (
  update wakeclub.leads l
     set etiqueta        = $2,
         interesse       = nullif($3, ''),
         objecao         = nullif($4, ''),
         temperatura     = nullif($5, ''),
         data_agendada   = nullif($6::text, '')::timestamp
                             at time zone 'America/Sao_Paulo',
         resumo          = nullif($7, ''),
         horas_estimadas = $12::smallint,
         qualificar_apos = case when l.qualificar_apos = $13::timestamptz
                                then null else l.qualificar_apos end
   where l.id = $1::uuid
     and l.opt_out = false
  returning l.id, l.etiqueta, l.temperatura, l.interesse, l.objecao,
            l.data_agendada, l.resumo
),
cancelados as (
  update wakeclub.followups f
     set status = 'cancelado',
         motivo_cancelamento = 'requalificacao: a conversa andou'
    from wakeclub.followups o
   where o.id = f.id
     and f.lead_id = (select id from atualizado)
     and f.status in ('pendente', 'aguardando_aprovacao', 'aprovado')
     and f.tipo not in ('lembrete_d1', 'lembrete_dia')
  returning f.id, f.lead_id, f.tipo, f.agendado_para, f.motivo_cancelamento,
            o.status as status_antes
),
outbox as (
  insert into wakeclub.crm_outbox (lead_id, tipo, payload)
  select a.id,
         'qualificacao',
         jsonb_build_object(
           'etiqueta', a.etiqueta,
           'temperatura', a.temperatura,
           'interesse', a.interesse,
           'objecao', a.objecao,
           'data_agendada', a.data_agendada,
           'resumo', a.resumo)
    from atualizado a
  returning id
),
ev_qualificado as (
  insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
     estado_anterior, estado_novo, metadados,
     entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id,
     modelo, versao_prompt)
  select a.id, 'qualificador', 'lead_qualified', 'schedule',
         a.etiqueta || ' / ' || coalesce(a.temperatura, 'sem temperatura'),
         nullif($8::text, ''),
         jsonb_build_object(
           'etiqueta', b.etiqueta,
           'temperatura', b.temperatura,
           'interesse', b.interesse,
           'objecao', b.objecao,
           'data_agendada', b.data_agendada),
         jsonb_build_object(
           'etiqueta', a.etiqueta,
           'temperatura', a.temperatura,
           'interesse', a.interesse,
           'objecao', a.objecao,
           'data_agendada', a.data_agendada),
         jsonb_build_object(
           'resumo_chars', length(coalesce(a.resumo, '')),
           'followups_cancelados', (select count(*) from cancelados)),
         'lead', a.id, 'motor', $9::text,
         'motor:qual:' || $9::text || ':' || a.id::text,
         $10::text, $11::text
    from atualizado a
    join antes b on b.id = a.id
  on conflict do nothing
  returning id
),
ev_etapa as (
  insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
     estado_anterior, estado_novo, metadados,
     entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id,
     modelo, versao_prompt)
  select a.id, 'qualificador', 'stage_changed', 'schedule',
         coalesce(b.etiqueta, 'sem etiqueta') || ' -> ' || a.etiqueta,
         nullif($8::text, ''),
         jsonb_build_object('etiqueta', b.etiqueta),
         jsonb_build_object('etiqueta', a.etiqueta),
         '{}'::jsonb,
         'lead', a.id, 'motor', $9::text,
         'motor:qual:' || $9::text || ':' || a.id::text,
         $10::text, $11::text
    from atualizado a
    join antes b on b.id = a.id
   where a.etiqueta is distinct from b.etiqueta
  on conflict do nothing
  returning id
),
ev_temperatura as (
  insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
     estado_anterior, estado_novo, metadados,
     entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id,
     modelo, versao_prompt)
  select a.id, 'qualificador', 'temperature_changed', 'schedule',
         coalesce(b.temperatura, 'sem leitura') || ' -> ' ||
           coalesce(a.temperatura, 'sem leitura'),
         nullif($8::text, ''),
         jsonb_build_object('temperatura', b.temperatura),
         jsonb_build_object('temperatura', a.temperatura),
         '{}'::jsonb,
         'lead', a.id, 'motor', $9::text,
         'motor:qual:' || $9::text || ':' || a.id::text,
         $10::text, $11::text
    from atualizado a
    join antes b on b.id = a.id
   where a.temperatura is distinct from b.temperatura
  on conflict do nothing
  returning id
),
ev_cancelado as (
  insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
     estado_anterior, estado_novo, metadados,
     entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id,
     modelo, versao_prompt)
  select c.lead_id, 'qualificador', 'followup_cancelled', 'schedule',
         'cancelado na requalificacao',
         c.motivo_cancelamento,
         jsonb_build_object(
           'status', c.status_antes,
           'tipo', c.tipo,
           'agendado_para', c.agendado_para),
         jsonb_build_object('status', 'cancelado'),
         '{}'::jsonb,
         'followup', c.id, 'motor', $9::text,
         'motor:qual:' || $9::text || ':' || c.id::text,
         $10::text, $11::text
    from cancelados c
  on conflict do nothing
  returning id
)
select a.id as lead_id
  from atualizado a`;

async function gravar(
  db: PoolClient,
  { lead_id: leadId, lease }: { lead_id: string; lease: string },
  q: Qualificacao,
  rodada: string,
) {
  await db.query(SQL_GRAVAR, [
    leadId,
    q.etiqueta,
    q.interesse,
    q.objecao,
    q.temperatura,
    q.dataAgendada,
    q.resumo,
    q.justificativa,
    rodada,
    MODELO,
    VERSAO_PROMPT,
    q.horasEstimadas,
    lease,
  ]);
}

/**
 * Uma rodada: reivindica até 8 leads vencidos (lease de 15 min) e qualifica cada um na
 * própria transação. Falha da IA, da validação ou da gravação reagenda o lead em +10 min. Devolve quantos
 * leads foram qualificados.
 */
export async function tarefaQualificador(deps: { ia: ClienteIa }): Promise<number> {
  const rodada = randomUUID();
  const { rows } = await getPoolMotor().query<LinhaLead & { lease: string }>(SQL_REIVINDICAR);
  let qualificados = 0;
  for (const l of rows) {
    try {
      const cru = await deps.ia.chatJson<unknown>({
        modelo: MODELO,
        sistema: SISTEMA,
        usuario: montarPromptLead(l),
        schema: SCHEMA,
        nomeSchema: "qualificacao",
        reasoningEffort: "low",
        timeoutMs: 60000,
      });
      const q = validarQualificacao(cru, {
        etiquetaAtual: ou(l.etiqueta, "Novo lead"),
      });
      if ("erro" in q) throw new Error(q.erro);
      await comTransacao((c) => gravar(c, l, q, rodada));
      qualificados++;
    } catch (erro) {
      logErro("qualificador.falha", erro, { leadId: l.lead_id });
      await getPoolMotor()
        .query(SQL_REAGENDAR, [l.lead_id, l.lease])
        .catch((e: unknown) => logErro("qualificador.reagendar", e, { leadId: l.lead_id }));
    }
  }
  return qualificados;
}
