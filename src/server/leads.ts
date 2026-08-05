import { createServerFn } from "@tanstack/react-start";

import { getPool } from "./db";

/**
 * Um card do kanban. Espelha `wakeclub.v_leads_painel` — se um campo não está
 * na view, ele não existe aqui de propósito (a view é a superfície exposta).
 *
 * Datas viram string ISO na fronteira: o que trafega pro browser é JSON, e
 * Date atravessando serialização é fonte garantida de bug de fuso.
 */
export type LeadCard = {
  id: string;
  nome: string | null;
  telefone: string;
  etiqueta: string;
  etiquetaOrdem: number;
  temperatura: "quente" | "morno" | "frio" | null;
  origem: string | null;
  interesse: string | null;
  objecao: string | null;
  resumo: string | null;
  dataAgendada: string | null;
  nToques: number;
  optOut: boolean;
  atendenteId: string | null;
  atendenteNome: string | null;
  atribuidoEm: string | null;
  semAtendimento: boolean;
  semAtendimentoMotivo: string | null;
  ultimaMsgEm: string | null;
  aguardandoEquipe: boolean;
  horasEsperando: number | null;
  followupEm: string | null;
  followupTipo: string | null;
};

type Row = {
  id: string;
  nome: string | null;
  telefone: string;
  etiqueta: string;
  etiqueta_ordem: number;
  temperatura: LeadCard["temperatura"];
  origem: string | null;
  interesse: string | null;
  objecao: string | null;
  resumo: string | null;
  data_agendada: Date | null;
  n_toques: number;
  opt_out: boolean;
  atendente_id: string | null;
  atendente_nome: string | null;
  atribuido_em: Date | null;
  sem_atendimento: boolean;
  sem_atendimento_motivo: string | null;
  ultima_msg_em: Date | null;
  aguardando_equipe: boolean;
  horas_esperando: number | null;
  followup_em: Date | null;
  followup_tipo: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const getLeadsPainel = createServerFn({ method: "GET" }).handler(
  async (): Promise<LeadCard[]> => {
    // `select *` de propósito: a view já é a lista de colunas permitidas, e
    // repetir os nomes aqui só cria um segundo lugar para esquecer de atualizar.
    const { rows } = await getPool().query<Row>(
      `select *
         from wakeclub.v_leads_painel
        order by etiqueta_ordem, ultima_msg_em desc nulls last`,
    );

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      telefone: r.telefone,
      etiqueta: r.etiqueta,
      etiquetaOrdem: r.etiqueta_ordem,
      temperatura: r.temperatura,
      origem: r.origem,
      interesse: r.interesse,
      objecao: r.objecao,
      resumo: r.resumo,
      dataAgendada: iso(r.data_agendada),
      nToques: r.n_toques,
      optOut: r.opt_out,
      atendenteId: r.atendente_id,
      atendenteNome: r.atendente_nome,
      atribuidoEm: iso(r.atribuido_em),
      semAtendimento: r.sem_atendimento,
      semAtendimentoMotivo: r.sem_atendimento_motivo,
      ultimaMsgEm: iso(r.ultima_msg_em),
      aguardandoEquipe: r.aguardando_equipe,
      horasEsperando: r.horas_esperando,
      followupEm: iso(r.followup_em),
      followupTipo: r.followup_tipo,
    }));
  },
);
