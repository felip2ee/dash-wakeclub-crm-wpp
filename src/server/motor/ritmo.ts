/**
 * Ritmo do follow-up (spec fases 2-3 §7): quantos textos a IA prepara por dia e o
 * intervalo entre envios, conforme o modo em `configuracoes.ritmo`. Também as tarefas
 * que devolvem o modo aquecido ao conservador na meia-noite e que expiram o que ficou
 * sem decisão. Datas sempre em America/Sao_Paulo, no SQL ou por Intl, nunca no fuso
 * do processo.
 */
import { randomUUID } from "node:crypto";

import type { ClienteDb } from "../db";

export const MODOS = {
  conservador: { cotaDia: 20, intervaloSegundos: 120 },
  aquecido: { cotaDia: 60, intervaloSegundos: 45 },
} as const;

export type Modo = keyof typeof MODOS;

// Entidade fixa dos eventos de configuração (migração 0004).
const CONFIG_ID = "00000000-0000-0000-0000-000000000001";

const HORA_SP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "numeric",
  hourCycle: "h23",
});

/** Envio e preparo só das 8h às 19h59 de São Paulo. */
export function dentroDaJanela(agora: Date): boolean {
  const hora = Number(HORA_SP.format(agora));
  return hora >= 8 && hora <= 19;
}

const DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * Mesmo predicado de `tarefaExpirarFollowups`: o texto ficou pronto noutro dia de São Paulo
 * ou já passou das 19h59. `sugeridoEm` null só expira pelo horário, como no SQL.
 */
export function expiradoPorHorario(sugeridoEm: Date | null, agora: Date): boolean {
  const outroDia = sugeridoEm !== null && DIA_SP.format(sugeridoEm) < DIA_SP.format(agora);
  return outroDia || Number(HORA_SP.format(agora)) >= 20;
}

export async function lerRitmo(db: ClienteDb): Promise<{ modo: Modo; ligadoEm: string | null }> {
  const { rows } = await db.query<{ modo: string | null; ligado_em: string | null }>(
    `select valor->>'modo' as modo, valor->>'ligado_em' as ligado_em
       from wakeclub.configuracoes where chave = 'ritmo'`,
  );
  return {
    modo: rows[0]?.modo === "aquecido" ? "aquecido" : "conservador",
    ligadoEm: rows[0]?.ligado_em ?? null,
  };
}

/** Troca o modo (admin) e registra `rhythm_changed` no mesmo comando. */
export async function definirRitmo(db: ClienteDb, modo: Modo, usuarioId: string): Promise<void> {
  await db.query(
    `with antes as (
       select valor from wakeclub.configuracoes where chave = 'ritmo'
     ),
     novo as (
       insert into wakeclub.configuracoes (chave, valor)
       values ('ritmo', jsonb_build_object('modo', $1::text, 'ligado_em', now()))
       on conflict (chave) do update set valor = excluded.valor
       returning valor
     )
     insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
        estado_anterior, estado_novo, metadados,
        entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
     select null, 'humano', 'rhythm_changed', 'painel', 'ritmo ' || $1::text, null,
            coalesce((select valor from antes), '{}'::jsonb), n.valor,
            jsonb_build_object('usuario_id', $2::uuid),
            'config', $3::uuid, 'painel', $2::text,
            'painel:ritmo:' || $4::text
       from novo n`,
    [modo, usuarioId, CONFIG_ID, randomUUID()],
  );
}

/** Follow-ups preparados (com `sugerido_em`) hoje, no dia de São Paulo. */
export async function preparadosHoje(db: ClienteDb): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n
       from wakeclub.followups
      where (sugerido_em at time zone 'America/Sao_Paulo')::date
          = (now() at time zone 'America/Sao_Paulo')::date`,
  );
  return rows[0].n;
}

/** Aquecido ligado antes da meia-noite de hoje (SP) volta a conservador. Devolve 1 ou 0. */
export async function tarefaRitmoMeiaNoite(db: ClienteDb): Promise<number> {
  const rodada = randomUUID();
  const { rowCount } = await db.query(
    `with antes as (
       select valor
         from wakeclub.configuracoes
        where chave = 'ritmo'
          and valor->>'modo' = 'aquecido'
          and coalesce(((valor->>'ligado_em')::timestamptz at time zone 'America/Sao_Paulo')::date
                         < (now() at time zone 'America/Sao_Paulo')::date, true)
     ),
     voltou as (
       update wakeclub.configuracoes c
          set valor = '{"modo":"conservador"}'::jsonb
        where c.chave = 'ritmo' and exists (select 1 from antes)
       returning c.valor
     )
     insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
        estado_anterior, estado_novo, metadados,
        entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
     select null, 'sistema', 'rhythm_reset', 'schedule', 'aquecido -> conservador',
            'o modo aquecido vale só até a meia-noite de São Paulo',
            a.valor, v.valor, '{}'::jsonb,
            'config', $1::uuid, 'motor', $2::text, 'motor:ritmo:' || $2::text
       from voltou v cross join antes a
     on conflict do nothing`,
    [CONFIG_ID, rodada],
  );
  return rowCount ?? 0;
}

/**
 * Texto pronto sem decisão até 19h59 (SP) do dia em que ficou pronto vira `expirado`;
 * a notificação pendente dele é cancelada. Devolve quantos expiraram.
 */
export async function tarefaExpirarFollowups(db: ClienteDb, agora = new Date()): Promise<number> {
  const rodada = randomUUID();
  const { rowCount } = await db.query(
    `with expirados as (
       update wakeclub.followups f
          set status = 'expirado'
        where f.status = 'aguardando_aprovacao'
          and ((f.sugerido_em at time zone 'America/Sao_Paulo')::date
                 < ($2::timestamptz at time zone 'America/Sao_Paulo')::date
               or extract(hour from $2::timestamptz at time zone 'America/Sao_Paulo') >= 20)
       returning f.id, f.lead_id, f.tipo, f.sugerido_em
     ),
     notificacoes as (
       update wakeclub.notificacoes n
          set status = 'cancelada',
              erro = 'follow-up expirou sem decisão'
        where n.status = 'pendente'
          and n.followup_id in (select id from expirados)
       returning 1
     )
     insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
        estado_anterior, estado_novo, metadados,
        entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
     select e.lead_id, 'sistema', 'followup_expired', 'schedule', 'expirou sem decisão',
            'sem decisão até 19h59 do dia em que o texto ficou pronto',
            jsonb_build_object('status', 'aguardando_aprovacao', 'tipo', e.tipo,
                               'sugerido_em', e.sugerido_em),
            jsonb_build_object('status', 'expirado'),
            jsonb_build_object('notificacoes_canceladas', (select count(*) from notificacoes)),
            'followup', e.id, 'motor', $1::text, 'motor:exp:' || $1::text || ':' || e.id::text
       from expirados e
     on conflict do nothing`,
    [rodada, agora],
  );
  return rowCount ?? 0;
}
