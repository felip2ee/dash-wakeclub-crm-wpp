/**
 * Fila individual de followups e registro append-only de abertura.
 *
 * A leitura sempre é filtrada pelo usuário autenticado. O único INSERT marca
 * que o WhatsApp foi aberto; nunca altera o followup nem presume envio.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirSessao } from "./auth";
import { getPool, getPoolRw } from "./db";

export type FollowupFila = {
  followupId: string;
  leadId: string;
  nome: string | null;
  telefone: string;
  etiqueta: string;
  temperatura: string | null;
  interesse: string | null;
  objecao: string | null;
  resumo: string | null;
  nToques: number;
  ultimaMsgLeadEm: string | null;
  tipo: string;
  motivo: string | null;
  agendadoPara: string;
  textoSugerido: string;
  sugeridoEm: string | null;
  vencido: boolean;
  toques: number;
  ultimoToqueEm: string | null;
  jaTocado: boolean;
  temEco: boolean;
};

const iso = (data: Date | null) => (data ? data.toISOString() : null);

export const listarMinhaFila = createServerFn({ method: "GET" }).handler(
  async (): Promise<FollowupFila[]> => {
    const sessao = await exigirSessao();
    const { rows } = await getPool().query(
      `select followup_id, lead_id, nome, telefone, etiqueta, temperatura,
              interesse, objecao, resumo, n_toques, ultima_msg_lead_em, tipo,
              motivo, agendado_para, texto_sugerido, sugerido_em, vencido,
              toques, ultimo_toque_em, ja_tocado, tem_eco
         from wakeclub.v_followups_fila
        where atendente_id = $1::uuid
        order by vencido desc, agendado_para asc`,
      [sessao.usuarioId],
    );

    return rows.map((registro) => ({
      followupId: registro.followup_id,
      leadId: registro.lead_id,
      nome: registro.nome,
      telefone: registro.telefone,
      etiqueta: registro.etiqueta,
      temperatura: registro.temperatura,
      interesse: registro.interesse,
      objecao: registro.objecao,
      resumo: registro.resumo,
      nToques: Number(registro.n_toques ?? 0),
      ultimaMsgLeadEm: iso(registro.ultima_msg_lead_em),
      tipo: registro.tipo,
      motivo: registro.motivo,
      agendadoPara: registro.agendado_para.toISOString(),
      textoSugerido: registro.texto_sugerido,
      sugeridoEm: iso(registro.sugerido_em),
      vencido: registro.vencido,
      toques: Number(registro.toques ?? 0),
      ultimoToqueEm: iso(registro.ultimo_toque_em),
      jaTocado: registro.ja_tocado,
      temEco: registro.tem_eco,
    }));
  },
);

export const registrarToque = createServerFn({ method: "POST" })
  .validator(z.object({ followupId: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ registrado: true }> => {
    const sessao = await exigirSessao();
    const { rows } = await getPool().query(
      `select 1
         from wakeclub.v_followups_fila
        where followup_id = $1::uuid
          and atendente_id = $2::uuid
        limit 1`,
      [data.followupId, sessao.usuarioId],
    );

    if (!rows[0]) throw new Error("Followup não pertence à atendente autenticada.");

    await getPoolRw().query(
      `insert into wakeclub.followup_toques (followup_id, usuario_id)
       values ($1::uuid, $2::uuid)`,
      [data.followupId, sessao.usuarioId],
    );
    return { registrado: true };
  });
