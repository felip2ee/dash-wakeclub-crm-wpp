import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { agruparPorEtapa, precoHoraDe } from "@/lib/pipeline";
import { exigirAdmin } from "./auth";
import { getPool, getPoolMotor } from "./db";
import { valorCheio, valorEsperado } from "./motor/valor";

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

const paraCard = (r: Row): LeadCard => ({
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
});

export const getLeadsPainel = createServerFn({ method: "GET" }).handler(
  async (): Promise<LeadCard[]> => {
    await exigirAdmin();

    // `select *` de propósito: a view já é a lista de colunas permitidas, e
    // repetir os nomes aqui só cria um segundo lugar para esquecer de atualizar.
    const { rows } = await getPool().query<Row>(
      `select *
         from wakeclub.v_leads_painel
        order by etiqueta_ordem, ultima_msg_em desc nulls last`,
    );

    return rows.map(paraCard);
  },
);

/** Card do Pipeline: o do kanban mais horas estimadas e valores (spec das fases 2–3, §7). */
export type LeadPipeline = LeadCard & {
  horasEstimadas: number | null;
  saldoHoras: number | null;
  proximaAulaEm: string | null;
  ultimaAulaEm: string | null;
  valorCheio: number;
  valorEsperado: number;
};

export const getPipeline = createServerFn({ method: "GET" })
  .validator(z.object({ vendedorId: z.string().uuid().optional() }))
  .handler(async ({ data }) => {
    await exigirAdmin();

    const { rows } = await getPool().query<Row>(
      `select *
         from wakeclub.v_leads_painel
        where ($1::uuid is null or atendente_id = $1::uuid)
        order by ultima_msg_em desc nulls last`,
      [data.vendedorId ?? null],
    );

    // A view de produção não tem horas_estimadas nem o preço da hora: vêm do motor.
    // shortcut: o preço vem repetido em cada linha; separe a query se a lista crescer muito.
    const { rows: extras } = await getPoolMotor().query<{
      id: string;
      horas_estimadas: number | null;
      saldo_horas: number | null;
      proxima_aula_em: Date | null;
      ultima_aula_em: Date | null;
      preco_hora: string | null;
    }>(
      `select l.id, l.horas_estimadas, l.saldo_horas, l.proxima_aula_em, l.ultima_aula_em,
              (select c.valor #>> '{}' from wakeclub.configuracoes c
                where c.chave = 'preco_hora') as preco_hora
         from wakeclub.leads l
        where l.id = any($1::uuid[])`,
      [rows.map((r) => r.id)],
    );
    // Sem leads não há valor a mostrar; com leads, preço ausente é erro, não R$ 0,00.
    const precoHora = rows.length > 0 ? precoHoraDe(extras[0]) : 0;
    const porId = new Map(extras.map((e) => [e.id, e]));

    const cards = rows.map((r): LeadPipeline => {
      const card = paraCard(r);
      const extra = porId.get(r.id);
      const horasEstimadas = extra?.horas_estimadas ?? null;
      return {
        ...card,
        horasEstimadas,
        saldoHoras: extra?.saldo_horas ?? null,
        proximaAulaEm: extra?.proxima_aula_em?.toISOString() ?? null,
        ultimaAulaEm: extra?.ultima_aula_em?.toISOString() ?? null,
        valorCheio: valorCheio(horasEstimadas, precoHora),
        valorEsperado: valorEsperado({ ...card, horasEstimadas }, precoHora),
      };
    });

    return agruparPorEtapa(cards);
  });
