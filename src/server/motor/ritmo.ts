/**
 * Ritmo do follow-up (spec fases 2-3 §7, pipeline §8): quantos follow-ups saem por dia e o
 * intervalo entre envios, conforme o modo em `configuracoes.ritmo`. Também as tarefas que
 * devolvem o modo aquecido ao conservador na meia-noite, expiram o que ficou sem decisão e
 * cancelam lembrete de aula passada. Datas em America/Sao_Paulo, no SQL ou por Intl.
 */
// crypto global (Web Crypto), não `node:crypto`: este módulo chega ao bundle do cliente via
// aprovacao.ts e admin-ia.ts, e o import do Node quebra a hidratação.
import type { ClienteDb } from "../db";

// `cotaDia` limita envios por dia de São Paulo; preparar e decidir não têm limite (spec §8).
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
    [modo, usuarioId, CONFIG_ID, crypto.randomUUID()],
  );
}

/** Follow-ups enviados hoje, no dia de São Paulo: é o que a cota do modo limita. */
export async function enviadosHoje(db: ClienteDb): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n
       from wakeclub.followups
      where status = 'enviado'
        and (enviado_em at time zone 'America/Sao_Paulo')::date
          = (now() at time zone 'America/Sao_Paulo')::date`,
  );
  return rows[0].n;
}

/** Aquecido ligado antes da meia-noite de hoje (SP) volta a conservador. Devolve 1 ou 0. */
export async function tarefaRitmoMeiaNoite(db: ClienteDb): Promise<number> {
  const rodada = crypto.randomUUID();
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
 * Sugestão sem decisão com `expira_em` vencido vira `expirado` (o automático vale até 19h59
 * do dia, a varredura até 19h59 do dia seguinte); `expira_em` null é legado e não expira,
 * como em `aprovacao.decidir`. Lembrete de aula aberto cuja aula já passou vira `cancelado`.
 * Em ambos a notificação pendente é cancelada. Devolve quantos mudaram.
 */
export async function tarefaExpirarFollowups(db: ClienteDb, agora = new Date()): Promise<number> {
  const rodada = crypto.randomUUID();
  const expirados = await db.query(
    `with expirados as (
       update wakeclub.followups f
          set status = 'expirado'
        where f.status = 'aguardando_aprovacao'
          and f.expira_em <= $2::timestamptz
       returning f.id, f.lead_id, f.tipo, f.sugerido_em, f.expira_em
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
            'sem decisão até a validade da sugestão',
            jsonb_build_object('status', 'aguardando_aprovacao', 'tipo', e.tipo,
                               'sugerido_em', e.sugerido_em, 'expira_em', e.expira_em),
            jsonb_build_object('status', 'expirado'),
            jsonb_build_object('notificacoes_canceladas', (select count(*) from notificacoes)),
            'followup', e.id, 'motor', $1::text, 'motor:exp:' || $1::text || ':' || e.id::text
       from expirados e
     on conflict do nothing`,
    [rodada, agora],
  );
  const cancelados = await db.query(
    `with alvo as (
       select f.id, f.status
         from wakeclub.followups f
        where f.status in ('pendente', 'aguardando_aprovacao', 'aprovado')
          and f.tipo in ('lembrete_d1', 'lembrete_dia')
          and f.aula_em < $2::timestamptz
        for update
     ),
     cancelados as (
       update wakeclub.followups f
          set status = 'cancelado', motivo_cancelamento = 'aula já passou'
         from alvo a
        where f.id = a.id and f.status = a.status
       returning f.id, f.lead_id, f.tipo, f.aula_em, a.status as status_antes
     ),
     notificacoes as (
       update wakeclub.notificacoes n
          set status = 'cancelada',
              erro = 'aula já passou'
        where n.status = 'pendente'
          and n.followup_id in (select id from cancelados)
       returning 1
     )
     insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
        estado_anterior, estado_novo, metadados,
        entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
     select c.lead_id, 'sistema', 'followup_cancelled', 'schedule', 'lembrete cancelado',
            'aula já passou',
            jsonb_build_object('status', c.status_antes, 'tipo', c.tipo, 'aula_em', c.aula_em),
            jsonb_build_object('status', 'cancelado'),
            jsonb_build_object('notificacoes_canceladas', (select count(*) from notificacoes)),
            'followup', c.id, 'motor', $1::text, 'motor:aula:' || $1::text || ':' || c.id::text
       from cancelados c
     on conflict do nothing`,
    [rodada, agora],
  );
  return (expirados.rowCount ?? 0) + (cancelados.rowCount ?? 0);
}
