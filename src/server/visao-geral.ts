/**
 * Visão geral do admin (referência 03): o pipeline por etapa reaproveita `getPipeline`,
 * os alertas contam o que pede ação (aprovações, follow-ups vencidos, vendas sem dono, fila
 * do motor) e as vendas vêm de `lerResumoDinheiro` (fase 4).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { lerMonitorFila } from "./admin-motor";
import { exigirAdmin } from "./auth";
import { lerComercial } from "./comercial";
import { type ClienteDb, getPoolMotor } from "./db";
import { lerResumoDinheiro } from "./dinheiro";
import { getPipeline } from "./leads";

export type AlertasOperacao = {
  aprovacoesPendentes: number;
  followupsEmAtraso: number;
  /** Pagas, do sistema inteiro: venda sem dono não tem vendedor para filtrar. */
  vendasSemDono: number;
  filaFalhas: number;
  filaAtrasados: number;
};

/** Contagens dos alertas; `vendedorId` filtra os de lead (a fila é do sistema inteiro). */
export async function lerAlertas(
  db: ClienteDb,
  vendedorId: string | null,
): Promise<AlertasOperacao> {
  const [contagem, fila] = await Promise.all([
    db.query(
      `select count(*) filter (where f.status = 'aguardando_aprovacao')::int as aprovacoes,
              count(*) filter (where f.status = 'pendente'
                                 and f.agendado_para < now() - interval '2 days')::int as atrasados,
              (select count(*)::int from wakeclub.webhook_eventos
                where status = 'falhou') as fila_falhas,
              (select count(*)::int from wakeclub.vendas
                where lead_id is null and status = 'paga') as sem_dono
         from wakeclub.followups f
         join wakeclub.leads l on l.id = f.lead_id
        where f.status in ('aguardando_aprovacao', 'pendente')
          and ($1::uuid is null or l.atendente_id = $1::uuid)`,
      [vendedorId],
    ),
    lerMonitorFila(db),
  ]);
  const r = contagem.rows[0];
  return {
    aprovacoesPendentes: Number(r.aprovacoes),
    followupsEmAtraso: Number(r.atrasados),
    vendasSemDono: Number(r.sem_dono),
    filaFalhas: Number(r.fila_falhas),
    filaAtrasados: fila.atrasados,
  };
}

export const getVisaoGeral = createServerFn({ method: "GET" })
  .validator(
    z.object({
      // Período só recorta vendas; o pipeline é sempre o estado atual.
      periodo: z.object({ de: z.string().date(), ate: z.string().date() }),
      vendedorId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirAdmin();
    const [pipeline, alertas, vendas, comercial] = await Promise.all([
      getPipeline({ data: { vendedorId: data.vendedorId } }),
      lerAlertas(getPoolMotor(), data.vendedorId ?? null),
      lerResumoDinheiro(getPoolMotor(), data.periodo, data.vendedorId ?? null),
      lerComercial(getPoolMotor(), data.periodo, data.vendedorId ?? null),
    ]);
    return {
      // Sem os cards: a visão geral só mostra os totais por etapa.
      pipeline: {
        totais: pipeline.totais,
        colunas: pipeline.colunas.map(({ cards: _cards, ...coluna }) => coluna),
      },
      alertas,
      vendas,
      comercial,
    };
  });
