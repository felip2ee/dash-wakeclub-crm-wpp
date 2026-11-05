/**
 * Revisão das decisões (spec §9): o admin marca Concordo / Discordo, com observação, sobre
 * cada decisão humana da fila de aprovação. Só essa revisão alimenta os prompts; a decisão
 * da atendente libera ou barra o envio, mas não ensina. O SQL fica em funções que recebem
 * o cliente, para testar sem cookie; a exigência de admin fica nas server fns.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { type ClienteDb, comTransacao, getPoolMotor, type PoolClient } from "./db";

export type DecisaoParaRevisar = {
  avaliacaoId: string;
  followupId: string;
  leadNome: string | null;
  telefone: string;
  vendedorNome: string;
  decisao: "enviar" | "recusar";
  motivos: string[];
  textoLivre: string | null;
  textoOriginal: string | null;
  textoEnviado: string | null;
  etiqueta: string;
  decididoEm: string;
};

type LinhaDecisao = {
  avaliacao_id: string;
  followup_id: string;
  lead_nome: string | null;
  telefone: string;
  vendedor_nome: string;
  decisao: "enviar" | "recusar";
  motivos: string[];
  texto_livre: string | null;
  texto_original: string | null;
  texto_enviado: string | null;
  etiqueta: string;
  criado_em: Date;
};

/** Decisões dos últimos `dias` ainda sem revisão, mais recentes primeiro. */
export async function listarParaRevisar(
  db: ClienteDb,
  dias: number,
): Promise<DecisaoParaRevisar[]> {
  const { rows } = await db.query<LinhaDecisao>(
    `select a.id as avaliacao_id, a.followup_id, l.nome as lead_nome, l.telefone,
            u.nome as vendedor_nome, a.decisao, a.motivos, a.texto_livre,
            a.texto_original, a.texto_enviado, l.etiqueta, a.criado_em
       from wakeclub.followup_avaliacoes a
       join wakeclub.followups f on f.id = a.followup_id
       join wakeclub.leads l on l.id = f.lead_id
       join wakeclub.usuarios u on u.id = a.usuario_id
      where a.criado_em >= now() - make_interval(days => $1::int)
        and not exists (select 1 from wakeclub.followup_revisoes r where r.avaliacao_id = a.id)
      order by a.criado_em desc, a.id`,
    [dias],
  );
  return rows.map((r) => ({
    avaliacaoId: r.avaliacao_id,
    followupId: r.followup_id,
    leadNome: r.lead_nome,
    telefone: r.telefone,
    vendedorNome: r.vendedor_nome,
    decisao: r.decisao,
    motivos: r.motivos,
    textoLivre: r.texto_livre,
    textoOriginal: r.texto_original,
    textoEnviado: r.texto_enviado,
    etiqueta: r.etiqueta,
    decididoEm: r.criado_em.toISOString(),
  }));
}

type EntradaRevisao = { avaliacaoId: string; concorda: boolean; observacao?: string };

/**
 * Insere a revisão e o evento `review_recorded` num só comando. `automatica` marca a
 * revisão implícita do admin que decidiu direto na fila de aprovação.
 */
export async function gravarRevisao(
  db: ClienteDb,
  adminId: string,
  entrada: EntradaRevisao,
  automatica: boolean,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `with r as (
       insert into wakeclub.followup_revisoes (avaliacao_id, admin_id, concorda, observacao)
       select a.id, $2::uuid, $3::boolean, nullif($4::text, '')
         from wakeclub.followup_avaliacoes a where a.id = $1::uuid
       returning avaliacao_id
     )
     insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo, metadados,
        entidade_tipo, entidade_id, origem_tipo, correlacao_id)
     select f.lead_id, 'humano', 'review_recorded', 'painel',
            case when $3::boolean then 'concorda' else 'discorda' end,
            'revisão do admin',
            jsonb_build_object('usuario_id', $2::uuid, 'avaliacao_id', r.avaliacao_id,
                               'concorda', $3::boolean, 'automatica', $5::boolean),
            'followup', f.id, 'painel', 'painel:revisao:' || r.avaliacao_id::text
       from r
       join wakeclub.followup_avaliacoes a on a.id = r.avaliacao_id
       join wakeclub.followups f on f.id = a.followup_id`,
    [entrada.avaliacaoId, adminId, entrada.concorda, entrada.observacao ?? null, automatica],
  );
  return rowCount === 1;
}

/** Revisão manual do admin na tela "Revisão das decisões". Rode dentro de uma transação. */
export async function revisar(
  db: PoolClient,
  adminId: string,
  entrada: EntradaRevisao,
): Promise<void> {
  let gravou: boolean;
  try {
    gravou = await gravarRevisao(db, adminId, entrada, false);
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      throw new Error("Esta decisão já foi revisada.");
    }
    throw erro;
  }
  if (!gravou) throw new Error("Decisão não encontrada.");
}

export const listarDecisoesParaRevisar = createServerFn({ method: "GET" })
  .validator(z.object({ dias: z.number().int().min(1).max(90).default(7) }))
  .handler(async ({ data }): Promise<DecisaoParaRevisar[]> => {
    await exigirAdmin();
    return listarParaRevisar(getPoolMotor(), data.dias);
  });

export const revisarDecisao = createServerFn({ method: "POST" })
  .validator(
    z.object({
      avaliacaoId: z.string().uuid(),
      concorda: z.boolean(),
      observacao: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ revisado: true }> => {
    const admin = await exigirAdmin();
    await comTransacao((c) => revisar(c, admin.usuarioId, data));
    return { revisado: true };
  });
