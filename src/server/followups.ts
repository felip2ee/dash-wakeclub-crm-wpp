/**
 * Fila individual de followups e registro append-only de abertura.
 *
 * A leitura sempre é filtrada pelo usuário autenticado. O único INSERT marca
 * que o WhatsApp foi aberto; nunca altera o followup nem presume envio.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAtendente } from "./auth";
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

export type FollowupDaFilaOperacional = Pick<
  FollowupFila,
  | "followupId"
  | "tipo"
  | "motivo"
  | "agendadoPara"
  | "textoSugerido"
  | "sugeridoEm"
  | "vencido"
  | "toques"
  | "ultimoToqueEm"
  | "jaTocado"
  | "temEco"
>;

export type LeadFilaOperacional = {
  leadId: string;
  nome: string | null;
  telefone: string;
  etiqueta: string;
  temperatura: "quente" | "morno" | "frio" | null;
  resumo: string | null;
  nToques: number;
  ultimaMsgLeadEm: string | null;
  ultimaMsgEquipeEm: string | null;
  ultimaMsgEm: string | null;
  aguardandoEquipe: boolean;
  horasEsperando: number | null;
  followup: FollowupDaFilaOperacional | null;
};

const iso = (data: Date | null) => (data ? data.toISOString() : null);

export const listarMinhaFila = createServerFn({ method: "GET" }).handler(
  async (): Promise<FollowupFila[]> => {
    const sessao = await exigirAtendente();
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

/**
 * Une carteira e followup atual sem criar estado novo: a classificação da
 * experiência mobile usa apenas as duas views de leitura já autorizadas.
 */
export const listarFilaOperacional = createServerFn({ method: "GET" }).handler(
  async (): Promise<LeadFilaOperacional[]> => {
    const sessao = await exigirAtendente();
    const { rows } = await getPool().query(
      `select l.id as lead_id, l.nome, l.telefone, l.etiqueta, l.temperatura,
              l.resumo, l.n_toques, l.ultima_msg_lead_em,
              l.ultima_msg_equipe_em, l.ultima_msg_em, l.aguardando_equipe,
              l.horas_esperando,
              f.followup_id, f.tipo as followup_tipo, f.motivo as followup_motivo,
              f.agendado_para, f.texto_sugerido, f.sugerido_em, f.vencido,
              f.toques, f.ultimo_toque_em, f.ja_tocado, f.tem_eco
         from wakeclub.v_leads_painel l
         left join lateral (
           select q.followup_id, q.tipo, q.motivo, q.agendado_para,
                  q.texto_sugerido, q.sugerido_em, q.vencido, q.toques,
                  q.ultimo_toque_em, q.ja_tocado, q.tem_eco
             from wakeclub.v_followups_fila q
            where q.lead_id = l.id
              and q.atendente_id = $1::uuid
            order by q.vencido desc, q.agendado_para asc
            limit 1
         ) f on true
        where l.atendente_id = $1::uuid
          and not l.opt_out
          and not l.sem_atendimento
          and l.etiqueta <> 'Negociação encerrada'
        order by l.aguardando_equipe desc, l.ultima_msg_em desc nulls last`,
      [sessao.usuarioId],
    );

    return rows.map((linha) => ({
      leadId: linha.lead_id,
      nome: linha.nome,
      telefone: linha.telefone,
      etiqueta: linha.etiqueta,
      temperatura: linha.temperatura,
      resumo: linha.resumo,
      nToques: Number(linha.n_toques ?? 0),
      ultimaMsgLeadEm: iso(linha.ultima_msg_lead_em),
      ultimaMsgEquipeEm: iso(linha.ultima_msg_equipe_em),
      ultimaMsgEm: iso(linha.ultima_msg_em),
      aguardandoEquipe: linha.aguardando_equipe,
      horasEsperando: linha.horas_esperando === null ? null : Number(linha.horas_esperando),
      followup: linha.followup_id
        ? {
            followupId: linha.followup_id,
            tipo: linha.followup_tipo,
            motivo: linha.followup_motivo,
            agendadoPara: linha.agendado_para.toISOString(),
            textoSugerido: linha.texto_sugerido,
            sugeridoEm: iso(linha.sugerido_em),
            vencido: linha.vencido,
            toques: Number(linha.toques ?? 0),
            ultimoToqueEm: iso(linha.ultimo_toque_em),
            jaTocado: linha.ja_tocado,
            temEco: linha.tem_eco,
          }
        : null,
    }));
  },
);

export const registrarToque = createServerFn({ method: "POST" })
  .validator(z.object({ followupId: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ registrado: true }> => {
    const sessao = await exigirAtendente();
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
