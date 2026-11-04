/**
 * Fila de aprovação dos follow-ups (spec §8): nenhum texto da IA sai sem um humano tocar
 * "Enviar". Lista os cards `aguardando_aprovacao` do vendedor e grava a decisão (aprovar
 * ou recusar) junto com a avaliação que volta ao prompt do porteiro e do redator. O SQL
 * fica em funções que recebem o cliente, para testar sem cookie; a posse é conferida aqui.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin, exigirSessao, type Sessao } from "./auth";
import { type Autoria, autoria, type Direcao } from "./conversas";
import { type ClienteDb, comTransacao, getPoolMotor, type PoolClient } from "./db";
import { expiradoPorHorario } from "./motor/ritmo";
import { valorEsperado } from "./motor/valor";

export const MOTIVOS_RECUSA = [
  "Cedo demais",
  "Tom errado",
  "Já falei com ele",
  "Repetiu assunto",
  "Lead não quer",
  "Outro",
] as const;

export const MOTIVOS_ENVIO = ["Texto certo", "Lead quente", "Ajustei o texto", "Outro"] as const;

const comum = {
  followupId: z.string().uuid(),
  textoLivre: z.string().trim().max(500).optional(),
};

export const schemaDecisao = z.discriminatedUnion("decisao", [
  z.object({
    ...comum,
    decisao: z.literal("enviar"),
    texto: z.string().trim().min(1).max(4000).optional(),
    motivos: z.array(z.enum(MOTIVOS_ENVIO)).max(MOTIVOS_ENVIO.length),
  }),
  z.object({
    ...comum,
    decisao: z.literal("recusar"),
    motivos: z.array(z.enum(MOTIVOS_RECUSA)).max(MOTIVOS_RECUSA.length),
  }),
]);

export type EntradaDecisao = z.infer<typeof schemaDecisao>;

export type CardAprovacao = {
  followupId: string;
  leadId: string;
  nome: string | null;
  telefone: string;
  temperatura: string | null;
  etiqueta: string;
  horasEstimadas: number | null;
  valorEsperado: number;
  numeroToque: number;
  /** REABRIR | RETOMAR, gravado pelo redator no evento `message_generated`. */
  modo: string | null;
  textoSugerido: string;
  sugeridoEm: string | null;
  mensagens: { autoria: Autoria; texto: string | null; enviadaEm: string; direcao: Direcao }[];
};

type LinhaCard = {
  followup_id: string;
  lead_id: string;
  nome: string | null;
  telefone: string;
  temperatura: string | null;
  etiqueta: string;
  horas_estimadas: number | null;
  opt_out: boolean;
  sem_atendimento: boolean;
  data_agendada: Date | null;
  n_toques: number;
  modo: string | null;
  texto_sugerido: string;
  sugerido_em: Date | null;
  preco_hora: string | null;
  mensagens: {
    direcao: Direcao;
    texto: string | null;
    enviada_em: string;
    enviada_por: string | null;
    autor_nome: string | null;
  }[];
};

/** Cards aguardando aprovação; `vendedorId` null lista todos (só o admin chega a isso). */
export async function listarFila(
  db: ClienteDb,
  vendedorId: string | null,
): Promise<CardAprovacao[]> {
  const { rows } = await db.query<LinhaCard>(
    `select f.id as followup_id, l.id as lead_id, l.nome, l.telefone, l.temperatura,
            l.etiqueta, l.horas_estimadas, l.opt_out, l.sem_atendimento, l.data_agendada,
            l.n_toques, f.texto_sugerido, f.sugerido_em,
            (select e.metadados->>'modo' from wakeclub.eventos_automacao e
              where e.entidade_tipo = 'followup' and e.entidade_id = f.id
                and e.lead_id = l.id and e.tipo_evento = 'message_generated'
              order by e.ocorrido_em desc limit 1) as modo,
            (select (c.valor #>> '{}') from wakeclub.configuracoes c
              where c.chave = 'preco_hora') as preco_hora,
            coalesce((
              select json_agg(u order by u.enviada_em)
                from (select m.direcao, m.texto, m.enviada_em, m.enviada_por,
                             us.nome as autor_nome
                        from wakeclub.mensagens m
                        left join wakeclub.usuarios us on us.id = m.usuario_id
                       where m.lead_id = l.id
                       order by m.enviada_em desc
                       limit 6) u
            ), '[]'::json) as mensagens
       from wakeclub.followups f
       join wakeclub.leads l on l.id = f.lead_id
      where f.status = 'aguardando_aprovacao'
        and ($1::uuid is null or l.atendente_id = $1::uuid)
      order by f.sugerido_em nulls last, f.id`,
    [vendedorId],
  );
  return rows.map((r) => ({
    followupId: r.followup_id,
    leadId: r.lead_id,
    nome: r.nome,
    telefone: r.telefone,
    temperatura: r.temperatura,
    etiqueta: r.etiqueta,
    horasEstimadas: r.horas_estimadas,
    valorEsperado: valorEsperado(
      {
        etiqueta: r.etiqueta,
        temperatura: r.temperatura,
        horasEstimadas: r.horas_estimadas,
        optOut: r.opt_out,
        semAtendimento: r.sem_atendimento,
        dataAgendada: r.data_agendada?.toISOString() ?? null,
      },
      Number(r.preco_hora ?? 0),
    ),
    numeroToque: Number(r.n_toques) + 1,
    modo: r.modo,
    textoSugerido: r.texto_sugerido,
    sugeridoEm: r.sugerido_em?.toISOString() ?? null,
    mensagens: r.mensagens.map((m) => ({
      autoria: autoria(m.enviada_por, m.autor_nome),
      texto: m.texto,
      enviadaEm: new Date(m.enviada_em).toISOString(),
      direcao: m.direcao,
    })),
  }));
}

/** Vendedores ativos, para o seletor de fila do admin. */
export async function listarVendedores(db: ClienteDb): Promise<{ id: string; nome: string }[]> {
  const { rows } = await db.query<{ id: string; nome: string }>(
    `select id, nome from wakeclub.usuarios
      where papel = 'atendente' and ativo = true order by nome`,
  );
  return rows.map((v) => ({ id: v.id, nome: v.nome }));
}

/**
 * Grava a decisão do vendedor. Rode dentro de uma transação: trava o follow-up, confere
 * posse e status, muda o follow-up, insere a avaliação e o evento.
 */
export async function decidir(
  db: PoolClient,
  sessao: Sessao,
  entrada: EntradaDecisao,
  agora = new Date(),
) {
  const { rows } = await db.query<{
    lead_id: string;
    status: string;
    texto_sugerido: string | null;
    sugerido_em: Date | null;
  }>(
    `select f.lead_id, f.status, f.texto_sugerido, f.sugerido_em
       from wakeclub.followups f
       join wakeclub.leads l on l.id = f.lead_id
      where f.id = $1::uuid and ($2::boolean or l.atendente_id = $3::uuid)
      for update of f`,
    [entrada.followupId, sessao.papel === "admin", sessao.usuarioId],
  );
  const f = rows[0];
  if (!f) throw new Error("Follow-up indisponível.");
  if (f.status !== "aguardando_aprovacao") {
    throw new Error("Este follow-up não está mais aguardando aprovação.");
  }
  const enviar = entrada.decisao === "enviar";
  // A expiração roda a cada 5 min: entre 20h e a rodada, o card ainda aparece na fila.
  if (enviar && expiradoPorHorario(f.sugerido_em, agora)) {
    throw new Error("Follow-up expirou: a IA prepara um novo amanhã");
  }
  const textoEnviado = enviar ? (entrada.texto ?? f.texto_sugerido) : null;
  if (enviar && !textoEnviado?.trim()) throw new Error("Follow-up sem texto para enviar.");
  if (enviar) {
    await db.query(
      `update wakeclub.followups
          set status = 'aprovado', texto_enviado = $2::text,
              aprovado_em = now(), aprovado_por = $3::uuid
        where id = $1::uuid`,
      [entrada.followupId, textoEnviado, sessao.usuarioId],
    );
  } else {
    await db.query(
      `update wakeclub.followups
          set status = 'abortado', motivo_cancelamento = 'recusado pelo vendedor'
        where id = $1::uuid`,
      [entrada.followupId],
    );
  }
  await db.query(
    `insert into wakeclub.followup_avaliacoes
       (followup_id, usuario_id, decisao, motivos, texto_livre, texto_original, texto_enviado)
     values ($1::uuid, $2::uuid, $3::text, $4::text[], nullif($5::text, ''), $6::text, $7::text)`,
    [
      entrada.followupId,
      sessao.usuarioId,
      entrada.decisao,
      entrada.motivos,
      entrada.textoLivre ?? null,
      f.texto_sugerido,
      textoEnviado,
    ],
  );
  await db.query(
    `insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
        estado_anterior, estado_novo, metadados,
        entidade_tipo, entidade_id, origem_tipo, correlacao_id)
     values ($1::uuid, 'humano', $3::text, 'painel', $4::text, $5::text,
             jsonb_build_object('status', 'aguardando_aprovacao'),
             jsonb_build_object('status', $6::text),
             jsonb_build_object('usuario_id', $7::uuid, 'motivos', $8::text[],
                                'texto_editado', $9::boolean),
             'followup', $2::uuid, 'painel', 'painel:aprovacao:' || $2::text)`,
    [
      f.lead_id,
      entrada.followupId,
      enviar ? "followup_human_approved" : "followup_human_rejected",
      enviar ? "vendedor aprovou o envio" : "vendedor recusou o texto",
      enviar ? "aprovado na fila de aprovação" : "recusado pelo vendedor",
      enviar ? "aprovado" : "abortado",
      sessao.usuarioId,
      entrada.motivos,
      enviar && textoEnviado !== f.texto_sugerido,
    ],
  );
}

export const listarFilaAprovacao = createServerFn({ method: "GET" })
  .validator(z.object({ vendedorId: z.string().uuid().optional() }))
  .handler(async ({ data }): Promise<CardAprovacao[]> => {
    const sessao = await exigirSessao();
    // Atendente só vê a própria fila; admin escolhe o vendedor ou vê todas.
    const vendedorId = sessao.papel === "admin" ? (data.vendedorId ?? null) : sessao.usuarioId;
    return listarFila(getPoolMotor(), vendedorId);
  });

export const listarVendedoresAprovacao = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; nome: string }[]> => {
    await exigirAdmin();
    return listarVendedores(getPoolMotor());
  },
);

export const decidirFollowup = createServerFn({ method: "POST" })
  .validator(schemaDecisao)
  .handler(async ({ data }): Promise<{ decidido: true }> => {
    const sessao = await exigirSessao();
    await comTransacao((c) => decidir(c, sessao, data));
    return { decidido: true };
  });
