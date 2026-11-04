/**
 * Administração do motor próprio: monitor da fila `webhook_eventos`, reprocesso de
 * falhas, peso/comissão por vendedor e correção do dono de um lead. Cada server fn
 * exige admin; o SQL fica em helpers que recebem o cliente, para testar sem cookie.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { type ClienteDb, comTransacao, getPoolMotor, getPoolRw } from "./db";
import { corrigirDono } from "./motor/distribuicao";

export type MonitorFila = {
  pendentes: number;
  atrasados: number;
  /** Total com falha; `falhas` traz só as 50 mais recentes. */
  falhos: number;
  falhas: {
    id: number;
    origem: string;
    erro: string | null;
    recebidoEm: string;
    tentativas: number;
  }[];
};

export async function lerMonitorFila(db: ClienteDb): Promise<MonitorFila> {
  const [contagem, falhas] = await Promise.all([
    db.query(
      `select count(*) filter (where status = 'pendente')::int as pendentes,
              count(*) filter (where (status = 'pendente'
                                      and proxima_tentativa_em < now() - interval '5 minutes')
                                  or (status = 'processando'
                                      and processando_desde < now() - interval '15 minutes'))::int as atrasados,
              count(*) filter (where status = 'falhou')::int as falhos
         from wakeclub.webhook_eventos
        where status in ('pendente', 'processando', 'falhou')`,
    ),
    db.query(
      `select id, origem, erro, recebido_em, tentativas
         from wakeclub.webhook_eventos
        where status = 'falhou'
        order by recebido_em desc
        limit 50`,
    ),
  ]);
  return {
    pendentes: Number(contagem.rows[0].pendentes),
    atrasados: Number(contagem.rows[0].atrasados),
    falhos: Number(contagem.rows[0].falhos),
    falhas: falhas.rows.map((r) => ({
      id: Number(r.id),
      origem: r.origem,
      erro: r.erro,
      recebidoEm: r.recebido_em.toISOString(),
      tentativas: Number(r.tentativas),
    })),
  };
}

export async function reprocessarOuFalhar(db: ClienteDb, id: number): Promise<void> {
  // Import dinâmico: no dev o Vite não faz tree-shaking e um import estático levaria
  // o motor (e o `pg`) ao bundle do navegador.
  const { reprocessar } = await import("./motor/fila");
  if (!(await reprocessar(db, id))) throw new Error("O evento não está mais com falha.");
}

export const getMonitorFila = createServerFn({ method: "GET" }).handler(
  async (): Promise<MonitorFila> => {
    await exigirAdmin();
    return lerMonitorFila(getPoolMotor());
  },
);

export const reprocessarEvento = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }): Promise<{ reprocessado: true }> => {
    await exigirAdmin();
    await reprocessarOuFalhar(getPoolMotor(), data.id);
    return { reprocessado: true };
  });

export const alterarPesoComissao = createServerFn({ method: "POST" })
  .validator(
    z.object({
      usuarioId: z.string().uuid(),
      peso: z.number().int().min(0).max(10),
      comissaoPct: z.number().min(0).max(100),
    }),
  )
  .handler(async ({ data }): Promise<{ alterado: true }> => {
    await exigirAdmin();
    const { rowCount } = await getPoolRw().query(
      `update wakeclub.usuarios
          set peso = $2::smallint, comissao_pct = $3::numeric
        where id = $1::uuid and papel = 'atendente'`,
      [data.usuarioId, data.peso, data.comissaoPct],
    );
    if (rowCount !== 1) throw new Error("Atendente não encontrada.");
    return { alterado: true };
  });

export const corrigirDonoDoLead = createServerFn({ method: "POST" })
  .validator(z.object({ leadId: z.string().uuid(), usuarioId: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ corrigido: true }> => {
    const admin = await exigirAdmin();
    await comTransacao((c) => corrigirDono(c, data.leadId, data.usuarioId, admin.usuarioId));
    return { corrigido: true };
  });

export type DonoDoLeadInfo = {
  atendenteId: string | null;
  atribuidoPor: string | null;
  vendedores: { id: string; nome: string }[];
};

export const getDonoDoLead = createServerFn({ method: "GET" })
  .validator(z.object({ leadId: z.string().uuid() }))
  .handler(async ({ data }): Promise<DonoDoLeadInfo> => {
    await exigirAdmin();
    const db = getPoolMotor();
    const [lead, vendedores] = await Promise.all([
      db.query("select atendente_id, atribuido_por from wakeclub.leads where id = $1::uuid", [
        data.leadId,
      ]),
      db.query(
        `select id, nome from wakeclub.usuarios
          where papel = 'atendente' and ativo = true order by nome`,
      ),
    ]);
    if (!lead.rows[0]) throw new Error("Lead não encontrado.");
    return {
      atendenteId: lead.rows[0].atendente_id,
      atribuidoPor: lead.rows[0].atribuido_por,
      vendedores: vendedores.rows.map((v) => ({ id: v.id, nome: v.nome })),
    };
  });
