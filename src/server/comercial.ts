/**
 * Resumo comercial da Visão geral (spec visão comercial §4.3 e §8): vendas contra a meta
 * diária, leads novos por coorte (primeira mensagem do lead no período), conversão da
 * coorte em venda paga em qualquer data, origem do lead e tempo de primeira resposta.
 *
 * Dias e limites são de São Paulo, no SQL, como em `dinheiro.ts`. Coorte filtra por
 * `leads.atendente_id`; vendas por `vendas.vendedor_id`. `agora` existe para o teste.
 */
import { diaSP, mesCorrente } from "@/features/dinheiro/periodo";
import type { ClienteDb } from "./db";
import type { Periodo } from "./dinheiro";

const SP = "'America/Sao_Paulo'";
const CANAIS = ["anuncio", "link", "busca", "outro", "direto"] as const;
const DIA = 86_400_000;

export type Comparado = { atual: number; anterior: number };
export type OrigemLinha = {
  canal: "anuncio" | "link" | "busca" | "outro" | "direto";
  app: "instagram" | "facebook" | "whatsapp" | null;
  leadsNovos: number;
  compraram: number;
  conversaoPct: number;
  faturamento: number;
};
export type AnuncioLinha = {
  anuncioId: string | null;
  titulo: string | null;
  leadsNovos: number;
  compraram: number;
  conversaoPct: number;
  faturamento: number;
};
export type ResumoComercial = {
  periodo: { de: string; ate: string; dias: number; anterior: Periodo };
  meta: {
    porDia: number;
    periodo: number;
    atingidoPct: number;
    mesCorrente: boolean;
    diasDecorridos: number;
    projecaoMes: number | null;
  };
  /** `faturadoApp`/`faturadoDireta` dividem o faturamento atual: Direta = `origem_externa = 'pix'`. */
  vendas: {
    quantidade: Comparado;
    faturamento: Comparado;
    faturadoApp: number;
    faturadoDireta: number;
  };
  leadsNovos: Comparado;
  /** Sem comparação: a coorte anterior teve mais tempo para converter (spec §8). */
  coorte: { compraram: number; conversaoPct: number; faturamento: number };
  clientesExistentes: { quantidade: number; faturamento: number };
  /** Os 5 canais sempre, nesta ordem; anúncio desdobrado por app quando houver lead. */
  porOrigem: OrigemLinha[];
  anuncios: AnuncioLinha[];
  atendimento: {
    medianaPrimeiraRespostaMin: { atual: number | null; anterior: number | null };
    semResposta: number;
  };
};

// Em centavos, para a soma de 0.1 + 0.2 não virar 0.30000000000000004.
const somar = (valores: number[]) => Math.round(valores.reduce((t, v) => t + v * 100, 0)) / 100;
const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
const utc = (dia: string) => Date.parse(`${dia}T00:00:00Z`);
const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Dias corridos, contando `de` e `ate`. */
export function diasDoPeriodo(p: Periodo): number {
  return Math.round((utc(p.ate) - utc(p.de)) / DIA) + 1;
}

/** Os mesmos N dias, terminando no dia anterior a `de`. */
export function periodoAnterior(p: Periodo): Periodo {
  const ate = utc(p.de) - DIA;
  return { de: dia(ate - (diasDoPeriodo(p) - 1) * DIA), ate: dia(ate) };
}

/** Meta = por dia × dias do período; projeção só quando o período é o mês corrente. */
export function resumoMeta(a: {
  periodo: Periodo;
  metaDia: number;
  vendas: number;
  agora: Date;
}): ResumoComercial["meta"] {
  const dias = diasDoPeriodo(a.periodo);
  const mes = mesCorrente(a.agora);
  const corrente = a.periodo.de === mes.de && a.periodo.ate === mes.ate;
  const hoje = diaSP(a.agora);
  const [ano, m] = hoje.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const meta = a.metaDia * dias;
  return {
    porDia: a.metaDia,
    periodo: meta,
    atingidoPct: pct(a.vendas, meta),
    mesCorrente: corrente,
    diasDecorridos: dias,
    projecaoMes: corrente ? Math.round((a.vendas / dias) * diasNoMes) : null,
  };
}

// Limites do período atual e do anterior, que termina onde o atual começa.
const LIM = `lim as (
  select ($1::date)::timestamp at time zone ${SP} as ini,
         ($2::date + 1)::timestamp at time zone ${SP} as fim,
         ($4::date)::timestamp at time zone ${SP} as ini_ant,
         ($5::date + 1)::timestamp at time zone ${SP} as fim_ant)`;
const PRIMEIRA = `primeira as (
  select lead_id, min(enviada_em) as em from wakeclub.mensagens
   where direcao = 'lead' group by lead_id)`;
// Leads novos do período atual e do anterior, do dono filtrado.
const NOVOS = `novos as (
  select l.id, p.em, p.em >= lim.ini as atual,
         coalesce(l.origem_canal, 'direto') as canal,
         case when l.origem_canal = 'anuncio' then l.origem_app end as app,
         case when l.origem_canal = 'anuncio' then l.origem_anuncio_id end as anuncio_id,
         case when l.origem_canal = 'anuncio' then l.origem_anuncio_titulo end as titulo
    from primeira p
    join wakeclub.leads l on l.id = p.lead_id
   cross join lim
   where p.em >= lim.ini_ant and p.em < lim.fim
     and ($3::uuid is null or l.atendente_id = $3::uuid))`;

type Grupo = {
  canal: OrigemLinha["canal"];
  app: OrigemLinha["app"];
  anuncioId: string | null;
  titulo: string | null;
  leads: number;
  compraram: number;
  faturamento: number;
};

function linha(gs: Grupo[]) {
  const leadsNovos = gs.reduce((t, g) => t + g.leads, 0);
  const compraram = gs.reduce((t, g) => t + g.compraram, 0);
  return {
    leadsNovos,
    compraram,
    conversaoPct: pct(compraram, leadsNovos),
    faturamento: somar(gs.map((g) => g.faturamento)),
  };
}

export async function lerComercial(
  db: ClienteDb,
  periodo: Periodo,
  vendedorId: string | null,
  agora = new Date(),
): Promise<ResumoComercial> {
  const anterior = periodoAnterior(periodo);
  const params = [periodo.de, periodo.ate, vendedorId, anterior.de, anterior.ate];
  const [vendas, coorte, atendimento, meta] = await Promise.all([
    db.query(
      `with ${LIM}, ${PRIMEIRA}
       select count(*) filter (where v.comprada_em >= lim.ini)::int as qtd,
              coalesce(sum(v.valor) filter (where v.comprada_em >= lim.ini), 0) as fat,
              coalesce(sum(v.valor) filter (where v.comprada_em >= lim.ini
                                 and v.origem_externa <> 'pix'), 0) as fat_app,
              coalesce(sum(v.valor) filter (where v.comprada_em >= lim.ini
                                 and v.origem_externa = 'pix'), 0) as fat_direta,
              count(*) filter (where v.comprada_em < lim.ini)::int as qtd_ant,
              coalesce(sum(v.valor) filter (where v.comprada_em < lim.ini), 0) as fat_ant,
              count(*) filter (where v.comprada_em >= lim.ini and v.lead_id is not null
                                 and not coalesce(p.em >= lim.ini and p.em < lim.fim, false))::int
                as existentes,
              coalesce(sum(v.valor) filter (where v.comprada_em >= lim.ini and v.lead_id is not null
                                 and not coalesce(p.em >= lim.ini and p.em < lim.fim, false)), 0)
                as fat_existentes
         from wakeclub.vendas v
        cross join lim
         left join primeira p on p.lead_id = v.lead_id
        where v.status = 'paga'
          and v.comprada_em >= lim.ini_ant and v.comprada_em < lim.fim
          and ($3::uuid is null or v.vendedor_id = $3::uuid)`,
      params,
    ),
    db.query(
      `with ${LIM}, ${PRIMEIRA}, ${NOVOS}
       select n.atual, n.canal, n.app, n.anuncio_id, n.titulo, count(*)::int as leads,
              count(*) filter (where c.qtd > 0)::int as compraram,
              coalesce(sum(c.fat), 0) as faturamento
         from novos n
        cross join lateral (
          select count(*) as qtd, coalesce(sum(v.valor), 0) as fat from wakeclub.vendas v
           where v.lead_id = n.id and v.status = 'paga') c
        group by n.atual, n.canal, n.app, n.anuncio_id, n.titulo`,
      params,
    ),
    db.query(
      `with ${LIM}, ${PRIMEIRA}, ${NOVOS}, r as (
         select n.atual,
                (select min(m.enviada_em) from wakeclub.mensagens m
                  where m.lead_id = n.id and m.direcao = 'equipe' and m.enviada_em > n.em)
                  - n.em as espera
           from novos n)
       select percentile_cont(0.5) within group (order by extract(epoch from espera) / 60)
                filter (where atual) as atual,
              percentile_cont(0.5) within group (order by extract(epoch from espera) / 60)
                filter (where not atual) as anterior,
              count(*) filter (where atual and espera is null)::int as sem_resposta
         from r`,
      params,
    ),
    db.query(
      `select valor #>> '{}' as meta from wakeclub.configuracoes where chave = 'meta_vendas_dia'`,
    ),
  ]);

  const v = vendas.rows[0];
  const grupos = coorte.rows.map((r) => ({
    atual: r.atual as boolean,
    canal: r.canal as Grupo["canal"],
    app: r.app as Grupo["app"],
    anuncioId: r.anuncio_id as string | null,
    titulo: r.titulo as string | null,
    leads: Number(r.leads),
    compraram: Number(r.compraram),
    faturamento: Number(r.faturamento),
  }));
  const atuais = grupos.filter((g) => g.atual);
  const qtdLeads = (gs: Grupo[]) => gs.reduce((t, g) => t + g.leads, 0);

  const porOrigem: OrigemLinha[] = CANAIS.flatMap((canal) => {
    const doCanal = atuais.filter((g) => g.canal === canal);
    const apps = [...new Set(doCanal.map((g) => g.app))].sort((a, b) =>
      String(a ?? "~").localeCompare(String(b ?? "~")),
    );
    if (apps.length === 0) return [{ canal, app: null, ...linha([]) }];
    return apps.map((app) => ({ canal, app, ...linha(doCanal.filter((g) => g.app === app)) }));
  });

  const porAnuncio = new Map<string, Grupo[]>();
  for (const g of atuais.filter((g) => g.canal === "anuncio")) {
    const chave = JSON.stringify([g.anuncioId, g.titulo]);
    porAnuncio.set(chave, [...(porAnuncio.get(chave) ?? []), g]);
  }
  const anuncios: AnuncioLinha[] = [...porAnuncio.values()]
    .map((gs) => ({ anuncioId: gs[0].anuncioId, titulo: gs[0].titulo, ...linha(gs) }))
    .sort(
      (a, b) =>
        b.leadsNovos - a.leadsNovos ||
        (a.titulo ?? "").localeCompare(b.titulo ?? "") ||
        (a.anuncioId ?? "").localeCompare(b.anuncioId ?? ""),
    );

  const total = linha(atuais);
  const a = atendimento.rows[0];
  const minutos = (x: unknown) => (x === null ? null : Math.round(Number(x)));
  const quantidade = { atual: v.qtd as number, anterior: v.qtd_ant as number };
  return {
    periodo: { ...periodo, dias: diasDoPeriodo(periodo), anterior },
    meta: resumoMeta({
      periodo,
      metaDia: Number(meta.rows[0]?.meta ?? 2),
      vendas: quantidade.atual,
      agora,
    }),
    vendas: {
      quantidade,
      faturamento: { atual: Number(v.fat), anterior: Number(v.fat_ant) },
      faturadoApp: Number(v.fat_app),
      faturadoDireta: Number(v.fat_direta),
    },
    leadsNovos: { atual: total.leadsNovos, anterior: qtdLeads(grupos.filter((g) => !g.atual)) },
    coorte: {
      compraram: total.compraram,
      conversaoPct: total.conversaoPct,
      faturamento: total.faturamento,
    },
    clientesExistentes: { quantidade: v.existentes, faturamento: Number(v.fat_existentes) },
    porOrigem,
    anuncios,
    atendimento: {
      medianaPrimeiraRespostaMin: { atual: minutos(a.atual), anterior: minutos(a.anterior) },
      semResposta: a.sem_resposta,
    },
  };
}
