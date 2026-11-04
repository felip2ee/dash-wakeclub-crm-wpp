import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { getPool } from "./db";

/**
 * As conversas. Espelha `wakeclub.v_conversas_painel` e
 * `wakeclub.v_mensagens_painel`, com a autoria de `wakeclub.v_mensagens_autoria`.
 *
 * O texto das mensagens passa por aqui — foi uma reversão consciente da regra
 * original, que mantinha `mensagens.texto` inalcançável para o painel. Ver o
 * cabeçalho de db/painel-views.sql. O painel continua sem conseguir escrever:
 * a role não tem acesso a tabela e a conexão abre read-only (ver db.ts).
 *
 * Datas viram string ISO na fronteira, como em leads.ts — Date atravessando
 * serialização é fonte garantida de bug de fuso.
 */

export type Conversa = {
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
  ultimaTexto: string | null;
  ultimaDirecao: Direcao | null;
  ultimaEnviadaEm: string | null;
  totalMensagens: number;
  msgsLeadSemResposta: number;
  ultimaMsgEm: string | null;
  aguardandoEquipe: boolean;
  horasEsperando: number | null;
  followupEm: string | null;
  followupTipo: string | null;
};

export type Direcao = "lead" | "equipe" | "ia";

/**
 * Quem mandou a mensagem da equipe (design §5.2): `app` traz o nome do autor; `celular`
 * é eco de envio fora do app ("enviado pelo ADM"); `null` é legado, antes da virada.
 */
export type Autoria = { tipo: "app"; nome: string } | { tipo: "celular" } | null;

export function autoria(enviadaPor: string | null, autorNome: string | null): Autoria {
  if (enviadaPor === "app") return { tipo: "app", nome: autorNome ?? "Equipe" };
  if (enviadaPor === "celular") return { tipo: "celular" };
  return null;
}

export type Mensagem = {
  id: string;
  leadId: string;
  direcao: Direcao;
  texto: string | null;
  enviadaEm: string;
  /** 0 erro · 1 pendente · 2 servidor · 3 entregue · 4 lido · 5 reproduzido */
  entregaNivel: number | null;
  entregaEm: string | null;
  autoria: Autoria;
};

type LinhaConversa = {
  id: string;
  nome: string | null;
  telefone: string;
  etiqueta: string;
  etiqueta_ordem: number;
  temperatura: Conversa["temperatura"];
  origem: string | null;
  interesse: string | null;
  objecao: string | null;
  resumo: string | null;
  data_agendada: Date | null;
  n_toques: number;
  opt_out: boolean;
  ultima_texto: string | null;
  ultima_direcao: Direcao | null;
  ultima_enviada_em: Date | null;
  total_mensagens: number;
  msgs_lead_sem_resposta: number;
  ultima_msg_em: Date | null;
  aguardando_equipe: boolean;
  horas_esperando: number | null;
  followup_em: Date | null;
  followup_tipo: string | null;
};

type LinhaMensagem = {
  id: string;
  lead_id: string;
  direcao: Direcao;
  texto: string | null;
  enviada_em: Date;
  entrega_nivel: number | null;
  entrega_em: Date | null;
  enviada_por: string | null;
  autor_nome: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const getConversas = createServerFn({ method: "GET" }).handler(
  async (): Promise<Conversa[]> => {
    await exigirAdmin();

    const { rows } = await getPool().query<LinhaConversa>(
      `select *
         from wakeclub.v_conversas_painel
        order by ultima_msg_em desc nulls last, criado_em desc`,
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
      ultimaTexto: r.ultima_texto,
      ultimaDirecao: r.ultima_direcao,
      ultimaEnviadaEm: iso(r.ultima_enviada_em),
      totalMensagens: r.total_mensagens,
      msgsLeadSemResposta: r.msgs_lead_sem_resposta,
      ultimaMsgEm: iso(r.ultima_msg_em),
      aguardandoEquipe: r.aguardando_equipe,
      horasEsperando: r.horas_esperando,
      followupEm: iso(r.followup_em),
      followupTipo: r.followup_tipo,
    }));
  },
);

/**
 * A thread de um lead.
 *
 * A view não filtra por lead — quem filtra é este parâmetro. O `uuid()` do zod
 * não é decoração: sem ele um id inválido viraria erro cru do Postgres na tela.
 */
export const getMensagens = createServerFn({ method: "GET" })
  .validator(z.object({ leadId: z.string().uuid() }))
  .handler(async ({ data }): Promise<Mensagem[]> => {
    await exigirAdmin();

    const { rows } = await getPool().query<LinhaMensagem>(
      `select m.id, m.lead_id, m.direcao, m.texto, m.enviada_em, m.entrega_nivel,
              m.entrega_em, a.enviada_por, a.autor_nome
         from wakeclub.v_mensagens_painel m
         left join wakeclub.v_mensagens_autoria a on a.mensagem_id = m.id
        where m.lead_id = $1::uuid
        order by m.enviada_em asc, m.criado_em asc`,
      [data.leadId],
    );

    return rows.map((r) => ({
      id: r.id,
      leadId: r.lead_id,
      direcao: r.direcao,
      texto: r.texto,
      enviadaEm: r.enviada_em.toISOString(),
      entregaNivel: r.entrega_nivel,
      entregaEm: iso(r.entrega_em),
      autoria: autoria(r.enviada_por, r.autor_nome),
    }));
  });
