import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin, exigirSessao } from "./auth";
import { type ClienteDb, getPool, getPoolMotor } from "./db";

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
 *
 * A linha do tempo (eventos, sugestão da IA, tipo de mídia) lê tabelas que nenhuma view
 * do painel expõe; vai pela role do motor, como a fila de aprovação (aprovacao.ts).
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
  /** Há follow-up `aguardando_aprovacao` (sugestão da IA esperando um humano). */
  followupAguardando: boolean;
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

    const [{ rows }, sugestoes] = await Promise.all([
      getPool().query<LinhaConversa>(
        `select *
           from wakeclub.v_conversas_painel
          order by ultima_msg_em desc nulls last, criado_em desc`,
      ),
      leadsComSugestao(getPoolMotor(), null),
    ]);

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
      followupAguardando: sugestoes.has(r.id),
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

/** Leads com follow-up `aguardando_aprovacao`; `atendenteId` null = todos (admin). */
export async function leadsComSugestao(
  db: ClienteDb,
  atendenteId: string | null,
): Promise<Set<string>> {
  const { rows } = await db.query<{ lead_id: string }>(
    `select f.lead_id
       from wakeclub.followups f
       join wakeclub.leads l on l.id = f.lead_id
      where f.status = 'aguardando_aprovacao' and f.texto_sugerido is not null
        and ($1::uuid is null or l.atendente_id = $1::uuid)`,
    [atendenteId],
  );
  return new Set(rows.map((r) => r.lead_id));
}

export type LinhaDoTempo = {
  criadoEm: string;
  /** Só `stage_changed` e `followup_sent`, em ordem cronológica. */
  eventos: { tipo: string; ocorridoEm: string; de: string | null; para: string | null }[];
  sugestao: { followupId: string; texto: string; modo: string | null } | null;
  /** Mensagens de áudio → status da transcrição (o texto delas é a transcrição). */
  audios: Record<string, string | null>;
};

type LinhaLinhaDoTempo = {
  criado_em: Date;
  eventos: { tipo: string; ocorrido_em: string; de: string | null; para: string | null }[];
  sugestao: { followup_id: string; texto: string; modo: string | null } | null;
  audios: Record<string, string | null>;
};

/** `atendenteId` null = admin; senão o lead precisa ser dela. */
export async function lerLinhaDoTempo(
  db: ClienteDb,
  leadId: string,
  atendenteId: string | null,
): Promise<LinhaDoTempo> {
  const { rows } = await db.query<LinhaLinhaDoTempo>(
    `select l.criado_em,
            coalesce((
              select json_agg(json_build_object(
                       'tipo', e.tipo_evento, 'ocorrido_em', e.ocorrido_em,
                       'de', e.estado_anterior->>'etiqueta', 'para', e.estado_novo->>'etiqueta')
                     order by e.ocorrido_em, e.id)
                from wakeclub.eventos_automacao e
               where e.lead_id = l.id
                 and e.tipo_evento in ('stage_changed', 'followup_sent')
            ), '[]'::json) as eventos,
            (select json_build_object(
                      'followup_id', f.id, 'texto', f.texto_sugerido,
                      'modo', (select e.metadados->>'modo' from wakeclub.eventos_automacao e
                                where e.entidade_tipo = 'followup' and e.entidade_id = f.id
                                  and e.tipo_evento = 'message_generated'
                                order by e.ocorrido_em desc limit 1))
               from wakeclub.followups f
              where f.lead_id = l.id and f.status = 'aguardando_aprovacao'
                and f.texto_sugerido is not null
              order by f.agendado_para, f.id
              limit 1) as sugestao,
            coalesce((
              select json_object_agg(m.id, m.transcricao_status)
                from wakeclub.mensagens m
               where m.lead_id = l.id and m.tipo = 'audio'
            ), '{}'::json) as audios
       from wakeclub.leads l
      where l.id = $1::uuid and ($2::uuid is null or l.atendente_id = $2::uuid)`,
    [leadId, atendenteId],
  );
  const r = rows[0];
  if (!r) throw new Error("Lead não encontrado.");
  return {
    criadoEm: r.criado_em.toISOString(),
    eventos: r.eventos.map((e) => ({
      tipo: e.tipo,
      ocorridoEm: new Date(e.ocorrido_em).toISOString(),
      de: e.de,
      para: e.para,
    })),
    sugestao: r.sugestao && {
      followupId: r.sugestao.followup_id,
      texto: r.sugestao.texto,
      modo: r.sugestao.modo,
    },
    audios: r.audios,
  };
}

/** Linha do tempo da conversa, para `/` (admin) e `/meus-leads` (só os leads da atendente). */
export const getLinhaDoTempo = createServerFn({ method: "GET" })
  .validator(z.object({ leadId: z.string().uuid() }))
  .handler(async ({ data }): Promise<LinhaDoTempo> => {
    const sessao = await exigirSessao();
    return lerLinhaDoTempo(
      getPoolMotor(),
      data.leadId,
      sessao.papel === "admin" ? null : sessao.usuarioId,
    );
  });
