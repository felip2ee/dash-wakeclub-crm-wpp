import { createServerFn } from "@tanstack/react-start";

import { getPool } from "./db";

/**
 * Saúde do número (§13 do CLAUDE.md). Lê `wakeclub.v_saude_numero`, que o
 * WF-07 alimenta — a view já resolve o alerta, então aqui não há regra nenhuma.
 *
 * A view cruza três sinais independentes: eventos de conexão, heartbeat ativo
 * e ack de entrega. A ordem do CASE dela importa: sem heartbeat recente, nada
 * mais ali é confiável, porque o estado gravado pode ser de ontem.
 *
 * Devolve `null` quando `instancia_estado` está vazia — o WF-07 nunca rodou.
 */

export type Alerta =
  | "ok"
  | "sem heartbeat"
  | "evolution muda"
  | "evolution respondendo erro"
  | "desconectado"
  | "qr pendente"
  | "entrega travada";

export type SaudeNumero = {
  instancia: string;
  estado: "open" | "connecting" | "close" | null;
  statusReason: number | null;
  ultimoEventoEm: string | null;
  ultimoHeartbeatEm: string | null;
  heartbeatOk: boolean | null;
  heartbeatErro: string | null;
  minutosSemHeartbeat: number | null;
  conectadoDesde: string | null;
  desconectadoDesde: string | null;
  qrPendente: boolean;
  qrContador: number;
  enviadas24h: number;
  entregues24h: number;
  travadas24h: number;
  taxaEntrega24h: number | null;
  alerta: Alerta;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const getSaudeNumero = createServerFn({ method: "GET" }).handler(
  async (): Promise<SaudeNumero | null> => {
    const { rows } = await getPool().query("select * from wakeclub.v_saude_numero limit 1");

    const r = rows[0];
    if (!r) return null;

    return {
      instancia: r.instancia,
      estado: r.estado,
      statusReason: r.status_reason,
      ultimoEventoEm: iso(r.ultimo_evento_em),
      ultimoHeartbeatEm: iso(r.ultimo_heartbeat_em),
      heartbeatOk: r.heartbeat_ok,
      heartbeatErro: r.heartbeat_erro,
      minutosSemHeartbeat: r.minutos_sem_heartbeat,
      conectadoDesde: iso(r.conectado_desde),
      desconectadoDesde: iso(r.desconectado_desde),
      qrPendente: r.qr_pendente,
      qrContador: r.qr_contador,
      enviadas24h: Number(r.enviadas_24h ?? 0),
      entregues24h: Number(r.entregues_24h ?? 0),
      travadas24h: Number(r.travadas_24h ?? 0),
      // numeric → string no driver; ver a mesma armadilha em relatorios.ts
      taxaEntrega24h: r.taxa_entrega_24h === null ? null : Number(r.taxa_entrega_24h),
      alerta: r.alerta,
    };
  },
);
