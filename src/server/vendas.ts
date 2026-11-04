/**
 * Vendas para o admin (spec fase 4 §4, §5, §9): lista por período, vendas sem dono,
 * vínculo manual e estorno manual (para quando o webhook não trouxer o estorno). Cada
 * server fn exige admin; o SQL de leitura fica em helpers que recebem o cliente.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { type ClienteDb, comTransacao, getPoolMotor } from "./db";
import { estornar, vincular } from "./motor/vendas";

export type VendaLinha = {
  id: string;
  idExterno: string;
  compradaEm: string;
  valor: number;
  cpf: string | null;
  telefone: string | null;
  produto: string | null;
  horas: number | null;
  status: "paga" | "estornada";
  estornadaEm: string | null;
  leadId: string | null;
  leadNome: string | null;
  vendedorId: string | null;
  vendedorNome: string | null;
  categoria: string | null;
  comissaoPct: number | null;
  comissaoValor: number | null;
  vinculadaPor: string | null;
};

const SELECT = `select v.id, v.id_externo, v.comprada_em, v.valor, v.cpf, v.telefone, v.produto,
                      v.horas, v.status, v.estornada_em, v.lead_id, l.nome as lead_nome,
                      v.vendedor_id, u.nome as vendedor_nome, v.categoria, v.comissao_pct,
                      v.comissao_valor, v.vinculada_por
                 from wakeclub.vendas v
                 left join wakeclub.leads l on l.id = v.lead_id
                 left join wakeclub.usuarios u on u.id = v.vendedor_id`;

const numOuNull = (n: unknown) => (n === null ? null : Number(n));

function linha(r: Record<string, unknown>): VendaLinha {
  return {
    id: r.id as string,
    idExterno: r.id_externo as string,
    compradaEm: (r.comprada_em as Date).toISOString(),
    valor: Number(r.valor),
    cpf: r.cpf as string | null,
    telefone: r.telefone as string | null,
    produto: r.produto as string | null,
    horas: numOuNull(r.horas),
    status: r.status as VendaLinha["status"],
    estornadaEm: r.estornada_em ? (r.estornada_em as Date).toISOString() : null,
    leadId: r.lead_id as string | null,
    leadNome: r.lead_nome as string | null,
    vendedorId: r.vendedor_id as string | null,
    vendedorNome: r.vendedor_nome as string | null,
    categoria: r.categoria as string | null,
    comissaoPct: numOuNull(r.comissao_pct),
    comissaoValor: numOuNull(r.comissao_valor),
    vinculadaPor: r.vinculada_por as string | null,
  };
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filtroVendas = z.object({ de: dia, ate: dia, vendedorId: z.string().uuid().optional() });

/** Vendas com `comprada_em` entre os dias `de` e `ate` (inclusive), em São Paulo. */
export async function lerVendas(
  db: ClienteDb,
  f: z.infer<typeof filtroVendas>,
): Promise<VendaLinha[]> {
  const { rows } = await db.query(
    `${SELECT}
      where v.comprada_em >= ($1::date)::timestamp at time zone 'America/Sao_Paulo'
        and v.comprada_em < ($2::date + 1)::timestamp at time zone 'America/Sao_Paulo'
        and ($3::uuid is null or v.vendedor_id = $3::uuid)
      order by v.comprada_em desc
      limit 1000`,
    [f.de, f.ate, f.vendedorId ?? null],
  );
  return rows.map(linha);
}

export async function lerVendasSemDono(db: ClienteDb): Promise<VendaLinha[]> {
  const { rows } = await db.query(
    `${SELECT} where v.lead_id is null order by v.comprada_em desc limit 200`,
  );
  return rows.map(linha);
}

export const listarVendas = createServerFn({ method: "GET" })
  .validator(filtroVendas)
  .handler(async ({ data }): Promise<VendaLinha[]> => {
    await exigirAdmin();
    return lerVendas(getPoolMotor(), data);
  });

export const listarVendasSemDono = createServerFn({ method: "GET" }).handler(
  async (): Promise<VendaLinha[]> => {
    await exigirAdmin();
    return lerVendasSemDono(getPoolMotor());
  },
);

export const vincularVenda = createServerFn({ method: "POST" })
  .validator(z.object({ vendaId: z.string().uuid(), leadId: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ vinculada: true }> => {
    const admin = await exigirAdmin();
    await comTransacao((c) => vincular(c, data.vendaId, data.leadId, admin.usuarioId));
    return { vinculada: true };
  });

export const estornarVenda = createServerFn({ method: "POST" })
  .validator(z.object({ vendaId: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ estornada: true }> => {
    const admin = await exigirAdmin();
    const ok = await comTransacao((c) => estornar(c, data.vendaId, admin.usuarioId));
    if (!ok) throw new Error("Venda não encontrada ou já estornada.");
    return { estornada: true };
  });
