/**
 * Saúde do número (porta do WF-07, design §5): ack de entrega das mensagens, estado da
 * conexão da instância (eventos + QR) e heartbeat. O SQL é o dos nós "Gravar ack de
 * entrega", "Gravar estado da instancia" e "Gravar heartbeat ok/com falha".
 */
import type { PoolClient } from "../db";
import type { EventoConexao } from "../evolution/tipos";

/** O nível só sobe: ack fora de ordem não rebaixa. */
export async function aplicarAck(db: PoolClient, msgId: string, nivel: number): Promise<void> {
  await db.query(
    `update wakeclub.mensagens
        set entrega_nivel = greatest(coalesce(entrega_nivel, -1), $2::smallint),
            entrega_em = case
              when $2::smallint > coalesce(entrega_nivel, -1) then now()
              else entrega_em end
      where evolution_msg_id = nullif($1::text, '')`,
    [msgId, nivel],
  );
}

export async function aplicarConexao(db: PoolClient, e: EventoConexao): Promise<void> {
  await db.query(
    `with evt as (
       insert into wakeclub.instancia_eventos (instancia, evento, estado, status_reason, detalhe)
       values ($1::text, $2::text, nullif($3::text, ''), nullif($4::text, '')::int,
               coalesce(nullif($5::text, '')::jsonb, '{}'::jsonb))
       returning id
     )
     insert into wakeclub.instancia_estado as e (
       instancia, estado, status_reason, ultimo_evento_em,
       conectado_desde, desconectado_desde, qr_pendente, qr_desde, qr_contador
     ) values (
       $1::text, nullif($3::text, ''), nullif($4::text, '')::int, now(),
       case when $3::text = 'open' then now() end,
       case when $3::text = 'close' then now() end,
       $6::boolean,
       case when $6::boolean then now() end,
       case when $6::boolean then 1 else 0 end
     )
     on conflict (instancia) do update set
       estado = coalesce(nullif($3::text, ''), e.estado),
       status_reason = case when $3::text = '' then e.status_reason
                            else nullif($4::text, '')::int end,
       ultimo_evento_em = now(),
       conectado_desde = case when $3::text = 'open' and e.estado is distinct from 'open'
                              then now() else e.conectado_desde end,
       desconectado_desde = case when $3::text = 'close' and e.estado is distinct from 'close'
                                 then now() else e.desconectado_desde end,
       qr_pendente = case when $3::text = 'open' then false
                          else (e.qr_pendente or $6::boolean) end,
       qr_desde = case when $3::text = 'open' then null
                       when $6::boolean and not e.qr_pendente then now()
                       else e.qr_desde end,
       qr_contador = case when $3::text = 'open' then 0
                          when $6::boolean then e.qr_contador + 1
                          else e.qr_contador end`,
    [
      e.instancia,
      e.evento,
      e.estado ?? "",
      e.statusReason === null ? "" : String(e.statusReason),
      JSON.stringify(e.detalhe),
      e.qrPendente,
    ],
  );
}

export async function gravarHeartbeat(
  db: PoolClient,
  instancia: string,
  resultado: { estado: string } | { erro: string },
): Promise<void> {
  if ("erro" in resultado) {
    await db.query(
      `insert into wakeclub.instancia_estado as e (
         instancia, ultimo_heartbeat_em, heartbeat_ok, heartbeat_erro
       ) values ($1::text, now(), false, left(nullif($2::text, ''), 500))
       on conflict (instancia) do update set
         ultimo_heartbeat_em = now(),
         heartbeat_ok = false,
         heartbeat_erro = left(nullif($2::text, ''), 500)`,
      [instancia, resultado.erro || "sem detalhe"],
    );
    return;
  }
  await db.query(
    `with antes as (
       select estado from wakeclub.instancia_estado where instancia = $1::text
     ),
     novo as (
       insert into wakeclub.instancia_estado as e (
         instancia, estado, ultimo_heartbeat_em, heartbeat_ok, heartbeat_erro,
         conectado_desde, desconectado_desde
       ) values (
         $1::text, nullif($2::text, ''), now(), true, null,
         case when $2::text = 'open' then now() end,
         case when $2::text <> 'open' then now() end
       )
       on conflict (instancia) do update set
         estado = coalesce(nullif($2::text, ''), e.estado),
         ultimo_heartbeat_em = now(),
         heartbeat_ok = true,
         heartbeat_erro = null,
         conectado_desde = case when $2::text = 'open' and e.estado is distinct from 'open'
                                then now() else e.conectado_desde end,
         desconectado_desde = case when $2::text <> 'open'
                                        and e.estado is distinct from nullif($2::text, '')
                                   then now() else e.desconectado_desde end,
         qr_pendente = case when $2::text = 'open' then false else e.qr_pendente end,
         qr_desde = case when $2::text = 'open' then null else e.qr_desde end,
         qr_contador = case when $2::text = 'open' then 0 else e.qr_contador end
       returning e.instancia
     )
     insert into wakeclub.instancia_eventos (instancia, evento, estado, detalhe)
     select $1::text, 'heartbeat.mudou', nullif($2::text, ''),
            jsonb_build_object('de', (select estado from antes),
                               'para', nullif($2::text, ''))
      where (select estado from antes) is distinct from nullif($2::text, '')`,
    [instancia, resultado.estado],
  );
}
