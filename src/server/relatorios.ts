import { createServerFn } from "@tanstack/react-start";

import { getPool } from "./db";

/**
 * Relatórios. Quatro views agregadas, uma ida ao banco.
 *
 * Não existe relatório por atendente aqui, e isso é de propósito: a Evolution
 * espelha UM número, e `mensagens.direcao` só distingue `lead` / `equipe` /
 * `ia`. O banco não sabe quem da equipe digitou, então qualquer ranking de
 * atendente seria invenção. Ver §4 do CLAUDE.md.
 */

export type ResumoCrm = {
  totalLeads: number;
  leadsOptOut: number;
  leadsAtivos7d: number;
  aguardandoEquipe: number;
  mediaHorasEspera: number | null;
  leadsQualificados: number;
  qualificacoesTotal: number;
  qualificacoes24h: number;
  ultimaQualificacaoEm: string | null;
  filaQualificacao: number;
  followupsTotal: number;
  followupsPendentes: number;
  followupsVencidos: number;
  followupsEnviados: number;
  followupsCancelados: number;
  followupsAbortados: number;
  mensagensTotal: number;
  mensagens24h: number;
  ultimaMensagemEm: string | null;
};

export type EtapaFunil = {
  etiqueta: string;
  etiquetaOrdem: number;
  total: number;
  quente: number;
  morno: number;
  frio: number;
  semTemperatura: number;
  aguardandoEquipe: number;
};

export type VolumeDia = {
  dia: string;
  doLead: number;
  daEquipe: number;
  daIa: number;
  total: number;
};

export type AtividadeDia = {
  dia: string;
  qualificacoes: number;
  followupsCriados: number;
  followupsCancelados: number;
  followupsAbortados: number;
  followupsEnviados: number;
};

export type Relatorios = {
  resumo: ResumoCrm;
  funil: EtapaFunil[];
  volume: VolumeDia[];
  atividade: AtividadeDia[];
};

/** As views de dia devolvem `date`; o driver entrega Date. Só a parte YYYY-MM-DD interessa. */
const soData = (d: Date | string): string =>
  typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);

export const getRelatorios = createServerFn({ method: "GET" }).handler(
  async (): Promise<Relatorios> => {
    const pool = getPool();

    const [resumo, funil, volume, atividade] = await Promise.all([
      pool.query("select * from wakeclub.v_relatorio_resumo"),
      pool.query("select * from wakeclub.v_relatorio_funil order by etiqueta_ordem"),
      pool.query("select * from wakeclub.v_relatorio_volume_dia order by dia"),
      pool.query("select * from wakeclub.v_relatorio_wf02_dia order by dia"),
    ]);

    const r = resumo.rows[0];

    return {
      resumo: {
        totalLeads: r.total_leads,
        leadsOptOut: r.leads_opt_out,
        leadsAtivos7d: r.leads_ativos_7d,
        aguardandoEquipe: r.aguardando_equipe,
        // numeric do Postgres chega como string no driver — sem o Number()
        // o React renderiza "12.5" e qualquer conta em cima vira concatenação.
        mediaHorasEspera: r.media_horas_espera === null ? null : Number(r.media_horas_espera),
        leadsQualificados: r.leads_qualificados,
        qualificacoesTotal: r.qualificacoes_total,
        qualificacoes24h: r.qualificacoes_24h,
        ultimaQualificacaoEm: r.ultima_qualificacao_em
          ? (r.ultima_qualificacao_em as Date).toISOString()
          : null,
        filaQualificacao: r.fila_qualificacao,
        followupsTotal: r.followups_total,
        followupsPendentes: r.followups_pendentes,
        followupsVencidos: r.followups_vencidos,
        followupsEnviados: r.followups_enviados,
        followupsCancelados: r.followups_cancelados,
        followupsAbortados: r.followups_abortados,
        mensagensTotal: r.mensagens_total,
        mensagens24h: r.mensagens_24h,
        ultimaMensagemEm: r.ultima_mensagem_em
          ? (r.ultima_mensagem_em as Date).toISOString()
          : null,
      },
      funil: funil.rows.map((f) => ({
        etiqueta: f.etiqueta,
        etiquetaOrdem: f.etiqueta_ordem,
        total: f.total,
        quente: f.quente,
        morno: f.morno,
        frio: f.frio,
        semTemperatura: f.sem_temperatura,
        aguardandoEquipe: f.aguardando_equipe,
      })),
      volume: volume.rows.map((v) => ({
        dia: soData(v.dia),
        doLead: v.do_lead,
        daEquipe: v.da_equipe,
        daIa: v.da_ia,
        total: v.total,
      })),
      atividade: atividade.rows.map((a) => ({
        dia: soData(a.dia),
        qualificacoes: a.qualificacoes,
        followupsCriados: a.followups_criados,
        followupsCancelados: a.followups_cancelados,
        followupsAbortados: a.followups_abortados,
        followupsEnviados: a.followups_enviados,
      })),
    };
  },
);
