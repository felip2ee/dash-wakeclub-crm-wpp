/**
 * Fechamento mensal da comissão, pago no dia 10 (spec fase 4 §5, §6).
 *
 * O mês aberto é calculado na hora: vendas `paga` comissionáveis com `comprada_em` no mês
 * em São Paulo, mais os lançamentos pendentes do vendedor. `marcarPago` congela o mês:
 * liga as vendas e consome os lançamentos num `fechamentos` pago. Depois disso o mês não
 * muda; estorno de venda paga e venda atrasada do mês viram lançamento no próximo.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin, exigirSessao } from "./auth";
import { type ClienteDb, comTransacao, getPoolMotor, type PoolClient } from "./db";

export type LinhaFechamento = {
  vendedorId: string;
  nome: string;
  totalVendas: number;
  quantidade: number;
  totalComissao: number;
  ajustes: number;
  aPagar: number;
  pagoEm: string | null;
};

export type Lancamento = {
  id: string;
  vendedorId: string;
  /** Nulo no saldo negativo levado de um mês pago. */
  vendaId: string | null;
  fechamentoId: string | null;
  valor: number;
  motivo: string;
  criadoEm: string;
};

const MES_SP = "date_trunc('month', v.comprada_em at time zone 'America/Sao_Paulo')::date";

/** Mesma chave em `fecharMes` e `vendaAtrasada`: nenhuma venda escapa entre o cálculo e o pago. */
const travar = (db: PoolClient, vendedorId: string, mes: string) =>
  db.query("select pg_advisory_xact_lock(hashtext('fechamento:' || $1::text || ':' || $2::text))", [
    vendedorId,
    mes,
  ]);

/** Por vendedor ativo, ou com vendas, fechamento ou lançamento pendente no mês. */
export async function calcularFechamento(db: ClienteDb, mes: string): Promise<LinhaFechamento[]> {
  const { rows } = await db.query(
    `with f as (
       select * from wakeclub.fechamentos where mes = ($1::text || '-01')::date
     ), vv as (
       -- Mês pago: as vendas ligadas a ele, mesmo estornadas depois. Aberto: cálculo na hora.
       select v.vendedor_id, count(*)::int as quantidade, sum(v.valor) as total_vendas,
              sum(v.comissao_valor) as total_comissao
         from wakeclub.vendas v
         left join f on f.vendedor_id = v.vendedor_id
        where case when f.pago_em is not null then v.fechamento_id = f.id
                   else v.status = 'paga' and v.comissao_valor > 0 and v.fechamento_id is null
                        and ${MES_SP} = ($1::text || '-01')::date end
        group by v.vendedor_id
     ), pend as (
       select vendedor_id, sum(valor) as soma from wakeclub.lancamentos_comissao
        where fechamento_id is null group by vendedor_id
     )
     select u.id, u.nome, coalesce(vv.total_vendas, 0) as total_vendas,
            coalesce(vv.quantidade, 0) as quantidade,
            coalesce(vv.total_comissao, 0) as total_comissao, a.ajustes,
            case when f.pago_em is not null then f.a_pagar
                 else coalesce(vv.total_comissao, 0) + a.ajustes end as a_pagar, f.pago_em
       from wakeclub.usuarios u
       left join vv on vv.vendedor_id = u.id
       left join f on f.vendedor_id = u.id
       left join pend on pend.vendedor_id = u.id
       cross join lateral (select coalesce(case when f.pago_em is not null then f.ajustes
                                               else pend.soma end, 0) as ajustes) a
      where (u.ativo and u.papel = 'atendente') or vv.vendedor_id is not null
         or f.id is not null or pend.vendedor_id is not null
      order by u.nome, u.id`,
    [mes],
  );
  return rows.map((r) => ({
    vendedorId: r.id,
    nome: r.nome,
    totalVendas: Number(r.total_vendas),
    quantidade: r.quantidade,
    totalComissao: Number(r.total_comissao),
    ajustes: Number(r.ajustes),
    aPagar: Number(r.a_pagar),
    pagoEm: r.pago_em ? (r.pago_em as Date).toISOString() : null,
  }));
}

/**
 * Marca o mês encerrado do vendedor como pago e congela. Lança se o mês já foi pago ou
 * ainda não acabou. Saldo negativo paga 0 e vira lançamento pendente do próximo mês.
 */
export async function fecharMes(
  db: PoolClient,
  vendedorId: string,
  mes: string,
  adminId: string,
): Promise<string> {
  const aberto = await db.query<{ aberto: boolean }>(
    `select ($1::text || '-01')::date
              >= date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as aberto`,
    [mes],
  );
  if (aberto.rows[0].aberto) throw new Error("Só meses encerrados podem ser pagos.");
  await travar(db, vendedorId, mes);
  const { rows } = await db.query<{ id: string }>(
    `insert into wakeclub.fechamentos (vendedor_id, mes, pago_em, pago_por)
     values ($1::uuid, ($2::text || '-01')::date, now(), $3::uuid)
     on conflict (vendedor_id, mes) do update set pago_em = now(), pago_por = excluded.pago_por
      where wakeclub.fechamentos.pago_em is null
     returning id`,
    [vendedorId, mes, adminId],
  );
  if (!rows[0]) throw new Error("Mês já pago para este vendedor.");
  const id = rows[0].id;
  await db.query(
    `with v as (
       update wakeclub.vendas v set fechamento_id = $1::uuid
        where v.vendedor_id = $2::uuid and v.status = 'paga' and v.comissao_valor > 0
          and v.fechamento_id is null and ${MES_SP} = ($3::text || '-01')::date
       returning v.valor, v.comissao_valor
     ), l as (
       update wakeclub.lancamentos_comissao set fechamento_id = $1::uuid
        where vendedor_id = $2::uuid and fechamento_id is null
       returning valor
     ), t as (
       select coalesce((select sum(valor) from v), 0) as vendas,
              (select count(*) from v) as quantidade,
              coalesce((select sum(comissao_valor) from v), 0) as comissao,
              coalesce((select sum(valor) from l), 0) as lancado
     ), f as (
       update wakeclub.fechamentos
          set total_vendas = t.vendas, quantidade_vendas = t.quantidade,
              total_comissao = t.comissao, ajustes = t.lancado,
              a_pagar = greatest(t.comissao + t.lancado, 0)
         from t
        where id = $1::uuid
       returning id, total_vendas, quantidade_vendas, total_comissao, ajustes, a_pagar,
                 nullif(least(t.comissao + t.lancado, 0), 0) as saldo_negativo
     ), s as (
       insert into wakeclub.lancamentos_comissao (vendedor_id, venda_id, valor, motivo)
       select $2::uuid, null, f.saldo_negativo, 'saldo negativo de ' || $3::text
         from f where f.saldo_negativo is not null
     )
     insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo,
        metadados, entidade_tipo, entidade_id, origem_tipo, correlacao_id)
     select null, 'fechamento', 'commission_paid', 'admin', 'comissão do mês paga', null,
            '{}'::jsonb,
            jsonb_build_object('total_vendas', f.total_vendas,
                               'quantidade_vendas', f.quantidade_vendas,
                               'total_comissao', f.total_comissao, 'ajustes', f.ajustes,
                               'a_pagar', f.a_pagar, 'pago_por', $4::uuid),
            jsonb_build_object('vendedor_id', $2::uuid, 'mes', $3::text)
              || jsonb_strip_nulls(jsonb_build_object('saldo_negativo', f.saldo_negativo)),
            'config', f.id, 'painel', 'painel:fechamento:' || f.id::text
       from f`,
    [id, vendedorId, mes, adminId],
  );
  return id;
}

/**
 * Estorno de venda cuja comissão já foi paga (num fechamento) ou já lançada (venda
 * atrasada): lançamento negativo no próximo fechamento. Sem isso, não faz nada.
 */
export async function estornoPosFechamento(db: PoolClient, vendaId: string): Promise<void> {
  await db.query(
    `insert into wakeclub.lancamentos_comissao (vendedor_id, venda_id, valor, motivo)
     select v.vendedor_id, v.id, -v.comissao_valor,
            'estorno de venda do fechamento ' || to_char(${MES_SP}, 'YYYY-MM')
       from wakeclub.vendas v
      where v.id = $1::uuid and v.comissao_valor > 0
        and (v.fechamento_id is not null
             or exists (select 1 from wakeclub.lancamentos_comissao x
                         where x.venda_id = v.id and x.valor > 0))
        and not exists (select 1 from wakeclub.lancamentos_comissao x
                         where x.venda_id = v.id and x.valor < 0)`,
    [vendaId],
  );
}

/** Venda paga comissionável de mês já pago: lançamento positivo no próximo fechamento. */
export async function vendaAtrasada(db: PoolClient, vendaId: string): Promise<void> {
  const { rows } = await db.query<{ vendedor_id: string; mes: string }>(
    `select v.vendedor_id, to_char(${MES_SP}, 'YYYY-MM') as mes from wakeclub.vendas v
      where v.id = $1::uuid and v.status = 'paga' and v.comissao_valor > 0
        and v.fechamento_id is null`,
    [vendaId],
  );
  if (!rows[0]) return;
  await travar(db, rows[0].vendedor_id, rows[0].mes);
  await db.query(
    `insert into wakeclub.lancamentos_comissao (vendedor_id, venda_id, valor, motivo)
     select v.vendedor_id, v.id, v.comissao_valor, 'venda atrasada do mês ' || $2::text
       from wakeclub.vendas v
      where v.id = $1::uuid and v.fechamento_id is null
        and exists (select 1 from wakeclub.fechamentos f
                     where f.vendedor_id = v.vendedor_id and f.pago_em is not null
                       and f.mes = ($2::text || '-01')::date)
        and not exists (select 1 from wakeclub.lancamentos_comissao x where x.venda_id = v.id)`,
    [vendaId, rows[0].mes],
  );
}

/** Lançamentos mais recentes; `vendedorId` nulo traz todos (só admin). */
export async function lerLancamentos(
  db: ClienteDb,
  vendedorId: string | null,
): Promise<Lancamento[]> {
  const { rows } = await db.query(
    `select id, vendedor_id, venda_id, fechamento_id, valor, motivo, criado_em
       from wakeclub.lancamentos_comissao
      where $1::uuid is null or vendedor_id = $1::uuid
      order by criado_em desc
      limit 200`,
    [vendedorId],
  );
  return rows.map((r) => ({
    id: r.id,
    vendedorId: r.vendedor_id,
    vendaId: r.venda_id,
    fechamentoId: r.fechamento_id,
    valor: Number(r.valor),
    motivo: r.motivo,
    criadoEm: (r.criado_em as Date).toISOString(),
  }));
}

const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const getFechamento = createServerFn({ method: "GET" })
  .validator(z.object({ mes }))
  .handler(async ({ data }): Promise<LinhaFechamento[]> => {
    await exigirAdmin();
    return calcularFechamento(getPoolMotor(), data.mes);
  });

export const marcarPago = createServerFn({ method: "POST" })
  .validator(z.object({ vendedorId: z.string().uuid(), mes }))
  .handler(async ({ data }): Promise<{ pago: true }> => {
    const admin = await exigirAdmin();
    await comTransacao((c) => fecharMes(c, data.vendedorId, data.mes, admin.usuarioId));
    return { pago: true };
  });

/** Admin vê todos (ou um vendedor); vendedor só os próprios, ignorando o filtro. */
export const listarLancamentos = createServerFn({ method: "GET" })
  .validator(z.object({ vendedorId: z.string().uuid().optional() }))
  .handler(async ({ data }): Promise<Lancamento[]> => {
    const sessao = await exigirSessao();
    const vendedorId = sessao.papel === "admin" ? (data.vendedorId ?? null) : sessao.usuarioId;
    return lerLancamentos(getPoolMotor(), vendedorId);
  });
