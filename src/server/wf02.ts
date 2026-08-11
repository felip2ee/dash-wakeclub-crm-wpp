import { createServerFn } from "@tanstack/react-start";

import { exigirAdmin } from "./auth";
import { getPool } from "./db";

/**
 * O que o WF-02 (Qualificador IA) está fazendo.
 *
 * O WF-02 não tem log próprio. O que ele deixa para trás é:
 *
 *   · `crm_outbox` com tipo='qualificacao' — cada decisão que ele tomou;
 *   · `followups` — o que ele agendou e o que foi cancelado;
 *   · `leads.qualificar_apos` — a fila, e o rastro de execução que falhou.
 *
 * As três views abaixo (v_wf02_atividade, v_wf02_motor, v_followups_painel)
 * transformam isso em algo legível. Ver db/painel-views.sql.
 */

export type QualificacaoIA = {
  id: string;
  leadId: string;
  nome: string | null;
  telefone: string;
  qualificadoEm: string;
  etiqueta: string | null;
  temperatura: string | null;
  interesse: string | null;
  objecao: string | null;
  resumo: string | null;
  dataAgendada: string | null;
  etiquetaAnterior: string | null;
  temperaturaAnterior: string | null;
  objecaoAnterior: string | null;
  qualificacaoAnteriorEm: string | null;
  nQualificacao: number;
  totalQualificacoes: number;
  /** null na primeira qualificação: não existe "mudou" quando não havia antes. */
  mudouEtiqueta: boolean | null;
  mudouTemperatura: boolean | null;
  gerouFollowup: boolean;
  followupAgendadoPara: string | null;
  followupTipo: string | null;
  followupMotivo: string | null;
  followupStatus: string | null;
};

export type SituacaoMotor =
  | "ok"
  | "na fila"
  | "vencido"
  | "suspeita de retry de falha"
  | "orfao"
  | "opt-out";

export type LeadNoMotor = {
  leadId: string;
  nome: string | null;
  telefone: string;
  etiqueta: string;
  temperatura: string | null;
  optOut: boolean;
  qualificarApos: string | null;
  minutosParaVencer: number | null;
  vezesQualificado: number;
  ultimaQualificacaoEm: string | null;
  totalMensagens: number;
  ultimaMensagemEm: string | null;
  situacao: SituacaoMotor;
};

export type Followup = {
  id: string;
  leadId: string;
  nome: string | null;
  telefone: string;
  etiqueta: string;
  temperatura: string | null;
  agendadoPara: string;
  tipo: string;
  motivo: string | null;
  status: string;
  motivoCancelamento: string | null;
  textoEnviado: string | null;
  criadoEm: string;
  atualizadoEm: string;
  enviadoEm: string | null;
  vencido: boolean;
  minutosAteDisparo: number;
  atendenteNome: string | null;
  resumo: string | null;
  interesse: string | null;
  objecao: string | null;
  origem: string | null;
  dataAgendada: string | null;
  nToques: number;
  ultimaMsgLeadEm: string | null;
  ultimaMsgEquipeEm: string | null;
  textoSugerido: string | null;
  sugeridoEm: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const getWf02Atividade = createServerFn({ method: "GET" }).handler(
  async (): Promise<QualificacaoIA[]> => {
    await exigirAdmin();

    const { rows } = await getPool().query(
      `select *
         from wakeclub.v_wf02_atividade
        order by qualificado_em desc
        limit 500`,
    );

    return rows.map((r) => ({
      id: String(r.id),
      leadId: r.lead_id,
      nome: r.nome,
      telefone: r.telefone,
      qualificadoEm: (r.qualificado_em as Date).toISOString(),
      etiqueta: r.etiqueta,
      temperatura: r.temperatura,
      interesse: r.interesse,
      objecao: r.objecao,
      resumo: r.resumo,
      dataAgendada: r.data_agendada,
      etiquetaAnterior: r.etiqueta_anterior,
      temperaturaAnterior: r.temperatura_anterior,
      objecaoAnterior: r.objecao_anterior,
      qualificacaoAnteriorEm: iso(r.qualificacao_anterior_em),
      nQualificacao: r.n_qualificacao,
      totalQualificacoes: r.total_qualificacoes,
      mudouEtiqueta: r.mudou_etiqueta,
      mudouTemperatura: r.mudou_temperatura,
      gerouFollowup: r.gerou_followup,
      followupAgendadoPara: iso(r.followup_agendado_para),
      followupTipo: r.followup_tipo,
      followupMotivo: r.followup_motivo,
      followupStatus: r.followup_status,
    }));
  },
);

export const getWf02Motor = createServerFn({ method: "GET" }).handler(
  async (): Promise<LeadNoMotor[]> => {
    await exigirAdmin();

    // A ordem põe o que exige atenção primeiro: falha, órfão, vencido, fila.
    const { rows } = await getPool().query(
      `select *
         from wakeclub.v_wf02_motor
        order by case situacao
                   when 'suspeita de retry de falha' then 1
                   when 'orfao'                      then 2
                   when 'vencido'                    then 3
                   when 'na fila'                    then 4
                   when 'ok'                         then 5
                   else 6
                 end,
                 qualificar_apos asc nulls last,
                 ultima_mensagem_em desc nulls last`,
    );

    return rows.map((r) => ({
      leadId: r.lead_id,
      nome: r.nome,
      telefone: r.telefone,
      etiqueta: r.etiqueta,
      temperatura: r.temperatura,
      optOut: r.opt_out,
      qualificarApos: iso(r.qualificar_apos),
      minutosParaVencer: r.minutos_para_vencer,
      vezesQualificado: r.vezes_qualificado,
      ultimaQualificacaoEm: iso(r.ultima_qualificacao_em),
      totalMensagens: r.total_mensagens,
      ultimaMensagemEm: iso(r.ultima_mensagem_em),
      situacao: r.situacao,
    }));
  },
);

export const getFollowups = createServerFn({ method: "GET" }).handler(
  async (): Promise<Followup[]> => {
    await exigirAdmin();

    // Pendentes primeiro (é a agenda que importa), depois o histórico.
    const { rows } = await getPool().query(
      `select f.*,
              l.atendente_nome,
              l.resumo,
              l.interesse,
              l.objecao,
              l.origem,
              l.data_agendada,
              l.n_toques,
              l.ultima_msg_lead_em,
              l.ultima_msg_equipe_em,
              fila.texto_sugerido,
              fila.sugerido_em
         from wakeclub.v_followups_painel f
         left join wakeclub.v_leads_painel l on l.id = f.lead_id
         left join wakeclub.v_followups_fila fila on fila.followup_id = f.id
        order by case when f.status = 'pendente' then 0 else 1 end,
                 case when f.status = 'pendente' then f.agendado_para end asc,
                 f.atualizado_em desc
        limit 500`,
    );

    return rows.map((r) => ({
      id: r.id,
      leadId: r.lead_id,
      nome: r.nome,
      telefone: r.telefone,
      etiqueta: r.etiqueta,
      temperatura: r.temperatura,
      agendadoPara: (r.agendado_para as Date).toISOString(),
      tipo: r.tipo,
      motivo: r.motivo,
      status: r.status,
      motivoCancelamento: r.motivo_cancelamento,
      textoEnviado: r.texto_enviado,
      criadoEm: (r.criado_em as Date).toISOString(),
      atualizadoEm: (r.atualizado_em as Date).toISOString(),
      enviadoEm: iso(r.enviado_em),
      vencido: r.vencido,
      minutosAteDisparo: r.minutos_ate_disparo,
      atendenteNome: r.atendente_nome,
      resumo: r.resumo,
      interesse: r.interesse,
      objecao: r.objecao,
      origem: r.origem,
      dataAgendada: iso(r.data_agendada),
      nToques: Number(r.n_toques ?? 0),
      ultimaMsgLeadEm: iso(r.ultima_msg_lead_em),
      ultimaMsgEquipeEm: iso(r.ultima_msg_equipe_em),
      textoSugerido: r.texto_sugerido,
      sugeridoEm: iso(r.sugerido_em),
    }));
  },
);

/** Tudo que a aba do WF-02 precisa, numa ida só ao banco. */
export const getPainelWf02 = createServerFn({ method: "GET" }).handler(async () => {
  const [atividade, motor, followups] = await Promise.all([
    getWf02Atividade(),
    getWf02Motor(),
    getFollowups(),
  ]);
  return { atividade, motor, followups };
});

export type PainelWf02 = Awaited<ReturnType<typeof getPainelWf02>>;
