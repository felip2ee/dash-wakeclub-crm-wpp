/**
 * SQL do redator (porta do WF-03, docs/n8n-legado/wf-03-redator-de-followup.json), fora de
 * `redator.ts` só pelo tamanho. São os comandos dos nós do legado, com `origem_tipo 'motor'`
 * e correlação `'motor:red:' || <rodada> || ':' || <followup>` no lugar de `'wf03:'`. Também os
 * tipos das linhas e a gravação de cada desfecho.
 */
import type { PoolClient } from "../db";
import * as porteiro from "../ia/prompts/porteiro";
import * as redator from "../ia/prompts/redator";

export const MODELO_PORTEIRO = "gpt-5.4-mini";
export const MODELO_REDATOR = "gpt-5.4";

export type LinhaFollowup = {
  followup_id: string;
  lead_id: string;
  tipo: string;
  motivo: string | null;
  nome: string | null;
  etiqueta: string | null;
  interesse: string | null;
  objecao: string | null;
  temperatura: string | null;
  resumo: string | null;
  n_toques: number | null;
  atendente_id: string;
  atendente_nome: string | null;
  data_agendada_local: string | null;
  agora_local: string;
  minimo_local: string;
  limite_local: string;
  min_desde_lead: number | null;
  min_desde_equipe: number | null;
  historico: { quem: string; em: string | null; texto: string | null }[];
  textos_anteriores: { em: string | null; tipo: string; texto: string | null }[];
};

export type Vencido = {
  id: string;
  agendado_para: Date;
  etiqueta: string | null;
  temperatura: string | null;
  horas_estimadas: number | null;
  opt_out: boolean;
  sem_atendimento: boolean;
  data_agendada: Date | null;
  preco_hora: string | null;
};

export type Avaliacao = {
  decisao: string;
  motivos: string[];
  texto_livre: string | null;
  texto_original: string | null;
  texto_enviado: string | null;
};

// Todos os vencidos elegíveis (mesmas condições do "Buscar"), só com o que o valor esperado
// usa: as vagas do dia vão aos de maior valor entre todos, não só entre os 10 mais antigos.
export const SQL_VENCIDOS = `
select f.id, f.agendado_para, l.etiqueta, l.temperatura, l.horas_estimadas,
       l.opt_out, l.sem_atendimento, l.data_agendada,
       (select (c.valor #>> '{}') from wakeclub.configuracoes c
         where c.chave = 'preco_hora') as preco_hora
  from wakeclub.followups f
  join wakeclub.leads l on l.id = f.lead_id
  join wakeclub.usuarios u on u.id = l.atendente_id
 where f.status = 'pendente'
   and f.texto_sugerido is null
   and f.agendado_para <= now()
   and l.opt_out = false
   and l.sem_atendimento = false`;

// "Buscar followups a redigir" para os ids escolhidos ($1), mais o dono. Sem o filtro de
// hora do legado: a janela é conferida em código por `dentroDaJanela`, com o mesmo efeito.
export const SQL_BUSCAR = `
select
    f.id as followup_id,
    f.lead_id,
    f.tipo,
    f.motivo,
    l.nome,
    l.etiqueta,
    l.interesse,
    l.objecao,
    l.temperatura,
    l.resumo,
    l.n_toques,
    l.atendente_id,
    u.nome as atendente_nome,
    to_char(l.data_agendada at time zone 'America/Sao_Paulo',
            'YYYY-MM-DD HH24:MI') as data_agendada_local,
    to_char(now() at time zone 'America/Sao_Paulo',
            'YYYY-MM-DD HH24:MI') as agora_local,
    to_char((now() + interval '30 minutes') at time zone 'America/Sao_Paulo',
            'YYYY-MM-DD HH24:MI') as minimo_local,
    to_char((now() + interval '30 days') at time zone 'America/Sao_Paulo',
            'YYYY-MM-DD HH24:MI') as limite_local,
    round(extract(epoch from (now() - l.ultima_msg_lead_em)) / 60)::int
      as min_desde_lead,
    round(extract(epoch from (now() - l.ultima_msg_equipe_em)) / 60)::int
      as min_desde_equipe,
    (select coalesce(json_agg(json_build_object(
              'quem', h.direcao,
              'em', to_char(h.enviada_em at time zone 'America/Sao_Paulo',
                            'YYYY-MM-DD HH24:MI'),
              'texto', h.texto) order by h.enviada_em), '[]'::json)
       from (select m.direcao, m.enviada_em, m.texto
               from wakeclub.mensagens m
              where m.lead_id = f.lead_id
              order by m.enviada_em desc
              limit 30) h) as historico,
    (select coalesce(json_agg(json_build_object(
              'em', to_char(a.sugerido_em at time zone 'America/Sao_Paulo',
                            'YYYY-MM-DD HH24:MI'),
              'tipo', a.tipo,
              'texto', a.texto_sugerido) order by a.sugerido_em), '[]'::json)
       from (select b.tipo, b.texto_sugerido, b.sugerido_em
               from wakeclub.followups b
              where b.lead_id = f.lead_id
                and b.texto_sugerido is not null
                and b.id <> f.id
              order by b.sugerido_em desc
              limit 5) a) as textos_anteriores
  from wakeclub.followups f
  join wakeclub.leads l on l.id = f.lead_id
  join wakeclub.usuarios u on u.id = l.atendente_id
 where f.id = any($1::uuid[])
   and f.status = 'pendente'
   and f.texto_sugerido is null
   and f.agendado_para <= now()
   and l.opt_out = false
   and l.sem_atendimento = false
 order by f.agendado_para
 limit 10`;

// Até 10 avaliações do vendedor e até 10 recusas recentes dos outros (spec §8).
export const SQL_AVALIACOES = `
(select 'vendedor' as fonte, a.decisao, a.motivos, a.texto_livre,
        a.texto_original, a.texto_enviado
   from wakeclub.followup_avaliacoes a
  where a.usuario_id = $1::uuid
  order by a.criado_em desc
  limit 10)
union all
(select 'geral', a.decisao, a.motivos, a.texto_livre, a.texto_original, a.texto_enviado
   from wakeclub.followup_avaliacoes a
  where a.decisao = 'recusar'
    and a.usuario_id <> $1::uuid
  order by a.criado_em desc
  limit 10)`;

// "Gravar texto sugerido": agora também `aguardando_aprovacao`, push para '/aprovar' e
// `metadados.modo` (a fila de aprovação lê). Só grava se ainda está pendente: a conversa
// pode ter cancelado o follow-up enquanto a IA escrevia.
export const SQL_GRAVAR = `
with gravado as (
  update wakeclub.followups f
     set texto_sugerido = nullif($2, ''),
         sugerido_em = now(),
         status = 'aguardando_aprovacao'
   where f.id = $1::uuid
     and f.status = 'pendente'
     and f.texto_sugerido is null
  returning f.id, f.lead_id, f.tipo
), notificado as (
  insert into wakeclub.notificacoes (usuario_id, followup_id, tipo, titulo, corpo, url)
  select l.atendente_id,
         g.id,
         'followup',
         'Follow-up pronto: ' || coalesce(nullif(l.nome, ''), l.telefone),
         left($2, 120),
         '/aprovar'
    from gravado g
    join wakeclub.leads l on l.id = g.lead_id
   where l.atendente_id is not null
  returning id
), evento as (
  insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
     estado_anterior, estado_novo, metadados,
     entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id,
     modelo, versao_prompt)
  select g.lead_id, 'redator', 'message_generated', 'schedule',
         'texto sugerido no modo ' || $3::text,
         null,
         jsonb_build_object('status', 'pendente'),
         jsonb_build_object('texto_sugerido', true, 'status', 'aguardando_aprovacao'),
         jsonb_build_object(
           'tamanho', length($2),
           'tem_link', ($2 like '%http%'),
           'modo', $3::text,
           'tipo', g.tipo),
         'followup', g.id, 'motor', $4::text,
         'motor:red:' || $4::text || ':' || g.id::text,
         $5::text, $6::text
    from gravado g
  on conflict do nothing
  returning id
)
select (select count(*) from gravado)::int    as gravados,
       (select count(*) from notificado)::int as notificados,
       (select count(*) from evento)::int     as eventos`;

export const SQL_REAGENDAR_FALHA = `
update wakeclub.followups
   set agendado_para = now() + interval '30 minutes'
 where id = $1::uuid
   and status = 'pendente'
returning id, agendado_para`;

export const SQL_REAGENDAR = `
with antes as (
  select id, agendado_para
    from wakeclub.followups
   where id = $1::uuid
), reagendado as (
  update wakeclub.followups f
     set agendado_para = ($2::text)::timestamp at time zone 'America/Sao_Paulo',
         motivo_cancelamento = null
   where f.id = $1::uuid
     and f.status = 'pendente'
  returning f.id, f.lead_id, f.tipo, f.agendado_para
), evento as (
  insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
     estado_anterior, estado_novo, metadados,
     entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id,
     modelo, versao_prompt)
  select r.lead_id, 'porteiro', 'followup_rescheduled', 'schedule',
         'voltar em ' ||
           to_char(r.agendado_para at time zone 'America/Sao_Paulo',
                   'YYYY-MM-DD HH24:MI'),
         nullif($3::text, ''),
         jsonb_build_object('agendado_para', b.agendado_para),
         jsonb_build_object(
           'agendado_para', r.agendado_para,
           'status', 'pendente'),
         jsonb_build_object('tipo', r.tipo),
         'followup', r.id, 'motor', $4::text,
         'motor:red:' || $4::text || ':' || r.id::text,
         $5::text, $6::text
    from reagendado r
    join antes b on b.id = r.id
  on conflict do nothing
  returning id
)
select r.id, r.agendado_para,
       (select count(*) from evento)::int as eventos
  from reagendado r`;

export const SQL_ABORTAR = `
with abortado as (
  update wakeclub.followups f
     set status = 'abortado',
         motivo_cancelamento = left($2, 500)
   where f.id = $1::uuid
     and f.status = 'pendente'
  returning f.id, f.lead_id, f.tipo, f.agendado_para, f.motivo_cancelamento
), evento as (
  insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
     estado_anterior, estado_novo, metadados,
     entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id,
     modelo, versao_prompt)
  select a.lead_id, 'porteiro', 'followup_blocked', 'schedule',
         'barrou',
         a.motivo_cancelamento,
         jsonb_build_object(
           'status', 'pendente',
           'tipo', a.tipo,
           'agendado_para', a.agendado_para),
         jsonb_build_object('status', 'abortado'),
         '{}'::jsonb,
         'followup', a.id, 'motor', $3::text,
         'motor:red:' || $3::text || ':' || a.id::text,
         $4::text, $5::text
    from abortado a
  on conflict do nothing
  returning id
)
select a.id, 'abortado' as status, a.motivo_cancelamento,
       (select count(*) from evento)::int as eventos
  from abortado a`;

export const SQL_LIBERACAO = `
insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
     estado_anterior, estado_novo, metadados,
     entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id,
     modelo, versao_prompt)
select ($1::text)::uuid, 'porteiro', 'followup_approved', 'schedule',
       'liberou',
       nullif($3::text, ''),
       '{}'::jsonb,
       '{}'::jsonb,
       jsonb_build_object('tipo', $4::text),
       'followup', ($2::text)::uuid, 'motor', $5::text,
       'motor:red:' || $5::text || ':' || $2::text,
       $6::text, $7::text
on conflict do nothing
returning id`;

export type Desfecho =
  | { tipo: "reagendar"; quando: string; motivo: string }
  | { tipo: "abortar"; motivo: string }
  | { tipo: "gravar"; motivo: string; texto: string; modo: string };

/**
 * Grava o desfecho de um follow-up (dentro da transação dele). Devolve se o follow-up mudou:
 * já não estar pendente (a conversa cancelou) não muda nada nem deixa evento.
 */
export async function aplicar(
  db: PoolClient,
  d: LinhaFollowup,
  x: Desfecho,
  rodada: string,
): Promise<boolean> {
  const ia = [MODELO_PORTEIRO, porteiro.VERSAO_PROMPT];
  if (x.tipo === "reagendar") {
    const r = await db.query(SQL_REAGENDAR, [d.followup_id, x.quando, x.motivo, rodada, ...ia]);
    return (r.rowCount ?? 0) > 0;
  }
  if (x.tipo === "abortar") {
    const r = await db.query(SQL_ABORTAR, [d.followup_id, x.motivo, rodada, ...ia]);
    return (r.rowCount ?? 0) > 0;
  }
  const { rows } = await db.query<{ gravados: number }>(SQL_GRAVAR, [
    d.followup_id,
    x.texto,
    x.modo,
    rodada,
    MODELO_REDATOR,
    redator.VERSAO_PROMPT,
  ]);
  if (rows[0].gravados === 0) return false;
  await db.query(SQL_LIBERACAO, [d.lead_id, d.followup_id, x.motivo, d.tipo, rodada, ...ia]);
  return true;
}
