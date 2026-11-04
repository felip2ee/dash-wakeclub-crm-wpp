/**
 * Painéis em dinheiro (spec fase 4 §7, design §9.2 e §9.3): resumo do Kanban/Visão geral
 * (pipeline em reais, vendido no período, categorias, comissão a pagar no dia 10, ranking)
 * e o painel do vendedor (pode entrar, garantida no mês, a pagar dia 10, ranking semanal).
 *
 * Vendas contam só `status = 'paga'`; período, mês e semana são de São Paulo, no SQL. O
 * vendedor só vê o próprio dinheiro; o ranking semanal é a única visão de outro vendedor.
 * O SQL fica em funções que recebem o cliente; `agora` existe para o teste fixar o relógio.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { agruparPorEtapa, precoHoraDe } from "@/lib/pipeline";
import { exigirSessao, type Sessao } from "./auth";
import { type ClienteDb, getPoolMotor } from "./db";
import { calcularFechamento } from "./fechamento";
import { valorCheio, valorEsperado } from "./motor/valor";
import type { Categoria } from "./vendas/regras";
import { lerVendas, type VendaLinha } from "./vendas";

const SP = "'America/Sao_Paulo'";
const CATEGORIAS: Categoria[] = ["follow-up", "atendimento", "recompra", "espontanea"];

export type Periodo = { de: string; ate: string };

export type ResumoDinheiro = {
  pipelineCheio: number;
  pipelineEsperado: number;
  leadsAtivos: number;
  vendidoPeriodo: { valor: number; quantidade: number };
  /** As quatro categorias sempre; `null` (venda sem dono) só quando houver. */
  porCategoria: {
    categoria: Categoria | null;
    valor: number;
    quantidade: number;
    percentual: number;
  }[];
  comissaoAPagarDia10: { mes: string; valor: number };
  vendasRecentes: VendaLinha[];
  rankingPeriodo: {
    vendedorId: string;
    nome: string;
    vendas: number;
    valor: number;
    percentual: number;
  }[];
};

export type PosicaoRanking = {
  vendedorId: string;
  nome: string;
  valor: number;
  vendas: number;
  posicao: number;
  eu: boolean;
};

export type PainelVendedor = {
  podeEntrar: number;
  garantidaNoMes: number;
  aPagarDia10: { mes: string; valor: number };
  rankingSemanal: PosicaoRanking[];
};

// Em centavos, para a soma de 0.1 + 0.2 não virar 0.30000000000000004.
const somar = (valores: number[]) => Math.round(valores.reduce((t, v) => t + v * 100, 0)) / 100;
const percentual = (parte: number, total: number) =>
  total > 0 ? Math.round((parte / total) * 100) : 0;

/** Admin vê qualquer vendedor (ou todos, `null`); atendente só ele mesmo. */
export function vendedorPermitido(sessao: Sessao, vendedorId: string | undefined): string | null {
  if (sessao.papel === "admin") return vendedorId ?? null;
  if (vendedorId && vendedorId !== sessao.usuarioId) throw new Error("não autorizado");
  return sessao.usuarioId;
}

/** Totais do pipeline em reais, com as mesmas regras do Kanban (`agruparPorEtapa`). */
async function lerPipeline(db: ClienteDb, vendedorId: string | null) {
  const { rows } = await db.query(
    `select l.etiqueta, l.temperatura, l.horas_estimadas, l.opt_out, l.sem_atendimento,
            l.data_agendada,
            (select c.valor #>> '{}' from wakeclub.configuracoes c
              where c.chave = 'preco_hora') as preco_hora
       from wakeclub.leads l
      where $1::uuid is null or l.atendente_id = $1::uuid`,
    [vendedorId],
  );
  // Sem leads não há valor a mostrar; com leads, preço ausente é erro, não R$ 0,00.
  const precoHora = rows.length > 0 ? precoHoraDe(rows[0]) : 0;
  const cards = rows.map((r) => ({
    etiqueta: r.etiqueta as string,
    valorCheio: valorCheio(r.horas_estimadas, precoHora),
    valorEsperado: valorEsperado(
      {
        etiqueta: r.etiqueta,
        temperatura: r.temperatura,
        horasEstimadas: r.horas_estimadas,
        optOut: r.opt_out,
        semAtendimento: r.sem_atendimento,
        dataAgendada: r.data_agendada ? (r.data_agendada as Date).toISOString() : null,
      },
      precoHora,
    ),
  }));
  return agruparPorEtapa(cards).totais;
}

/** Comissão do mês anterior a `agora` ainda não paga (o que sai no dia 10). */
async function lerAPagarDia10(
  db: ClienteDb,
  vendedorId: string | null,
  agora: Date,
): Promise<{ mes: string; valor: number }> {
  const { rows } = await db.query<{ mes: string }>(
    `select to_char(date_trunc('month', $1::timestamptz at time zone ${SP}) - interval '1 month',
                    'YYYY-MM') as mes`,
    [agora],
  );
  const mes = rows[0].mes;
  const linhas = (await calcularFechamento(db, mes)).filter(
    (l) => l.pagoEm === null && (vendedorId === null || l.vendedorId === vendedorId),
  );
  // Saldo negativo paga 0 (`fecharMes`) e vai para o mês seguinte: não desconta dos outros.
  return { mes, valor: somar(linhas.map((l) => Math.max(0, l.aPagar))) };
}

export async function lerResumoDinheiro(
  db: ClienteDb,
  periodo: Periodo,
  vendedorId: string | null,
  agora = new Date(),
): Promise<ResumoDinheiro> {
  const filtro = `v.status = 'paga'
     and v.comprada_em >= ($1::date)::timestamp at time zone ${SP}
     and v.comprada_em < ($2::date + 1)::timestamp at time zone ${SP}
     and ($3::uuid is null or v.vendedor_id = $3::uuid)`;
  const params = [periodo.de, periodo.ate, vendedorId];
  const [pipeline, categorias, ranking, aPagar, vendas] = await Promise.all([
    lerPipeline(db, vendedorId),
    db.query(
      `select v.categoria, count(*)::int as quantidade, sum(v.valor) as valor
         from wakeclub.vendas v where ${filtro} group by v.categoria`,
      params,
    ),
    db.query(
      `select v.vendedor_id, u.nome, count(*)::int as vendas, sum(v.valor) as valor
         from wakeclub.vendas v join wakeclub.usuarios u on u.id = v.vendedor_id
        where ${filtro}
        group by v.vendedor_id, u.nome
        order by sum(v.valor) desc, u.nome, v.vendedor_id`,
      params,
    ),
    lerAPagarDia10(db, vendedorId, agora),
    lerVendas(db, { ...periodo, vendedorId: vendedorId ?? undefined }),
  ]);

  const porCat = new Map(categorias.rows.map((r) => [r.categoria as Categoria | null, r] as const));
  const total = somar(categorias.rows.map((r) => Number(r.valor)));
  const chaves: (Categoria | null)[] = porCat.has(null) ? [...CATEGORIAS, null] : CATEGORIAS;
  return {
    pipelineCheio: pipeline.valorCheio,
    pipelineEsperado: pipeline.valorEsperado,
    leadsAtivos: pipeline.leadsAtivos,
    vendidoPeriodo: {
      valor: total,
      quantidade: categorias.rows.reduce((t, r) => t + r.quantidade, 0),
    },
    porCategoria: chaves.map((categoria) => {
      const valor = Number(porCat.get(categoria)?.valor ?? 0);
      return {
        categoria,
        valor,
        quantidade: porCat.get(categoria)?.quantidade ?? 0,
        percentual: percentual(valor, total),
      };
    }),
    comissaoAPagarDia10: aPagar,
    // shortcut: `lerVendas` traz até 1000 do período (pagas e estornadas); as 10 pagas mais
    // recentes saem daí. Troque por query própria se um período tiver tantos estornos.
    vendasRecentes: vendas.filter((v) => v.status === "paga").slice(0, 10),
    rankingPeriodo: ranking.rows.map((r) => ({
      vendedorId: r.vendedor_id,
      nome: r.nome,
      vendas: r.vendas,
      valor: Number(r.valor),
      percentual: percentual(Number(r.valor), total),
    })),
  };
}

/** Semana de segunda 00h a domingo 23h59 em São Paulo, por valor comissionável pago. */
export async function lerRankingSemanal(
  db: ClienteDb,
  eu: string,
  agora = new Date(),
): Promise<PosicaoRanking[]> {
  const { rows } = await db.query(
    `with s as (
       select v.vendedor_id, count(*)::int as vendas, sum(v.valor) as valor
         from wakeclub.vendas v
        where v.status = 'paga' and v.comissao_valor > 0
          and date_trunc('week', v.comprada_em at time zone ${SP})
              = date_trunc('week', $1::timestamptz at time zone ${SP})
        group by v.vendedor_id
     )
     select u.id, u.nome, coalesce(s.vendas, 0) as vendas, coalesce(s.valor, 0) as valor,
            rank() over (order by coalesce(s.valor, 0) desc)::int as posicao
       from wakeclub.usuarios u
       left join s on s.vendedor_id = u.id
      where (u.ativo and u.papel = 'atendente') or s.vendedor_id is not null
      order by posicao, u.nome, u.id`,
    [agora],
  );
  return rows.map((r) => ({
    vendedorId: r.id,
    nome: r.nome,
    valor: Number(r.valor),
    vendas: r.vendas,
    posicao: r.posicao,
    eu: r.id === eu,
  }));
}

export async function lerPainelVendedor(
  db: ClienteDb,
  vendedorId: string,
  agora = new Date(),
): Promise<PainelVendedor> {
  const [pipeline, mes, aPagarDia10, rankingSemanal] = await Promise.all([
    lerPipeline(db, vendedorId),
    db.query(
      `select u.comissao_pct,
              (select coalesce(sum(v.comissao_valor), 0) from wakeclub.vendas v
                where v.vendedor_id = u.id and v.status = 'paga' and v.comissao_valor > 0
                  and date_trunc('month', v.comprada_em at time zone ${SP})
                      = date_trunc('month', $2::timestamptz at time zone ${SP})) as garantida
         from wakeclub.usuarios u where u.id = $1::uuid`,
      [vendedorId, agora],
    ),
    lerAPagarDia10(db, vendedorId, agora),
    lerRankingSemanal(db, vendedorId, agora),
  ]);
  const u = mes.rows[0];
  if (!u) throw new Error("Vendedor não encontrado.");
  return {
    // Em centavos: esperado × % / 100.
    podeEntrar: Math.round(pipeline.valorEsperado * Number(u.comissao_pct)) / 100,
    garantidaNoMes: Number(u.garantida),
    aPagarDia10,
    rankingSemanal,
  };
}

const dia = z.string().date();

export const getResumoDinheiro = createServerFn({ method: "GET" })
  .validator(
    z.object({
      periodo: z.object({ de: dia, ate: dia }),
      vendedorId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }): Promise<ResumoDinheiro> => {
    const sessao = await exigirSessao();
    const vendedorId = vendedorPermitido(sessao, data.vendedorId);
    return lerResumoDinheiro(getPoolMotor(), data.periodo, vendedorId);
  });

/** Atendente vê o próprio; admin escolhe o vendedor. */
export const getPainelVendedor = createServerFn({ method: "GET" })
  .validator(z.object({ vendedorId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<PainelVendedor> => {
    const sessao = await exigirSessao();
    const vendedorId = vendedorPermitido(sessao, data?.vendedorId);
    if (!vendedorId) throw new Error("Informe o vendedor.");
    return lerPainelVendedor(getPoolMotor(), vendedorId);
  });

export const getRankingSemanal = createServerFn({ method: "GET" }).handler(
  async (): Promise<PosicaoRanking[]> => {
    const sessao = await exigirSessao();
    return lerRankingSemanal(getPoolMotor(), sessao.usuarioId);
  },
);
