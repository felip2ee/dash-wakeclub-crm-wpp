/**
 * Tela "Fila de envio" do admin (spec pipeline §8): aprovados que ainda não saíram, quantos
 * saem hoje pela cota do modo, previsão de esvaziar e remoção de um item. Esta tela nunca
 * envia: o envio é só da tarefa serializada `envio-followups`, que respeita a cota. O SQL
 * recebe o cliente, para testar sem cookie; a exigência de admin fica nas server fns.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { type ClienteDb, comTransacao, getPoolMotor, type PoolClient } from "./db";
import { LEMBRETES, listarCandidatos, ordenarFila } from "./motor/envio-followups";
import { dentroDaJanela, enviadosHoje, HORA_SP, lerRitmo, MODOS } from "./motor/ritmo";

export type ItemFila = {
  followupId: string;
  leadNome: string | null;
  telefone: string;
  vendedorNome: string | null;
  tipo: string;
  etiqueta: string;
  valorEsperado: number;
  aprovadoEm: string;
  posicao: number;
  reconferir: boolean;
  lembrete: boolean;
};

export type FilaEnvio = {
  itens: ItemFila[];
  saemHoje: number;
  cotaDia: number;
  enviadosHoje: number;
  previsaoDias: number;
};

/** Aprovados na ordem real de envio, com a cota do dia e quantos dias até esvaziar. */
export async function lerFilaEnvio(
  db: ClienteDb,
  { agora = new Date() }: { agora?: Date } = {},
): Promise<FilaEnvio> {
  const [candidatos, { modo }, enviados] = await Promise.all([
    listarCandidatos(db),
    lerRitmo(db),
    enviadosHoje(db),
  ]);
  const { rows } = await db.query<{
    id: string;
    lead_nome: string | null;
    telefone: string;
    vendedor_nome: string | null;
    etiqueta: string;
  }>(
    `select f.id, l.nome as lead_nome, l.telefone, u.nome as vendedor_nome, l.etiqueta
       from wakeclub.followups f
       join wakeclub.leads l on l.id = f.lead_id
       left join wakeclub.usuarios u on u.id = l.atendente_id
      where f.id = any($1::uuid[])`,
    [candidatos.map((c) => c.id)],
  );
  const lead = new Map(rows.map((r) => [r.id, r]));
  const itens = ordenarFila(candidatos).map((c, i): ItemFila => {
    const r = lead.get(c.id);
    // A linha de followups nunca é apagada: sem par aqui é bug, não corrida.
    if (!r) throw new Error(`Follow-up ${c.id} sumiu da fila.`);
    return {
      followupId: c.id,
      leadNome: r.lead_nome,
      telefone: r.telefone,
      vendedorNome: r.vendedor_nome,
      tipo: c.tipo,
      etiqueta: r.etiqueta,
      valorEsperado: c.valorEsperado,
      aprovadoEm: c.aprovadoEm.toISOString(),
      posicao: i + 1,
      reconferir: c.reconferir,
      lembrete: LEMBRETES.has(c.tipo),
    };
  });
  const { cotaDia } = MODOS[modo];
  // Depois das 19h59 nada mais sai hoje: a fila começa a andar amanhã às 8h.
  const janelaFechou = !dentroDaJanela(agora) && Number(HORA_SP.format(agora)) >= 20;
  return {
    itens,
    saemHoje: janelaFechou ? 0 : Math.min(itens.length, Math.max(0, cotaDia - enviados)),
    cotaDia,
    enviadosHoje: enviados,
    previsaoDias:
      itens.length === 0
        ? 0
        : janelaFechou
          ? 1 + Math.ceil(itens.length / cotaDia)
          : Math.ceil((itens.length + enviados) / cotaDia),
  };
}

/**
 * Tira um `aprovado` da fila: `abortado` + `followup_aborted` no mesmo comando. O UPDATE é
 * condicionado ao status, então se a tarefa de envio reivindicou a linha no meio (ou ela já
 * saiu), nada muda e o admin recebe aviso claro.
 */
export async function removerDaFila(
  db: PoolClient,
  adminId: string,
  followupId: string,
): Promise<void> {
  const { rowCount } = await db.query(
    `with ab as (
       update wakeclub.followups f
          set status = 'abortado', motivo_cancelamento = 'removido da fila pelo admin'
        where f.id = $1::uuid and f.status = 'aprovado'
       returning f.id, f.lead_id
     )
     insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
        estado_anterior, estado_novo, metadados,
        entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
     select ab.lead_id, 'humano', 'followup_aborted', 'painel', 'admin removeu da fila',
            'removido da fila pelo admin',
            jsonb_build_object('status', 'aprovado'), jsonb_build_object('status', 'abortado'),
            jsonb_build_object('usuario_id', $2::uuid),
            'followup', ab.id, 'painel', $2::text, 'painel:fila:' || ab.id::text
       from ab`,
    [followupId, adminId],
  );
  if (!rowCount) throw new Error("Este follow-up já saiu da fila.");
}

export const getFilaEnvio = createServerFn({ method: "GET" }).handler(
  async (): Promise<FilaEnvio> => {
    await exigirAdmin();
    return lerFilaEnvio(getPoolMotor());
  },
);

export const removerDaFilaEnvio = createServerFn({ method: "POST" })
  .validator(z.object({ followupId: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ removido: true }> => {
    const admin = await exigirAdmin();
    await comTransacao((c) => removerDaFila(c, admin.usuarioId, data.followupId));
    return { removido: true };
  });
