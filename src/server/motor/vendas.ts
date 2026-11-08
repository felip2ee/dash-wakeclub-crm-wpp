/**
 * Processamento das vendas do webhook (spec fase 4 §2, §4, §5).
 *
 * Grava a venda idempotente por `(origem_externa, id_externo)`, cruza com o lead (CPF,
 * senão telefone), categoriza pela janela de 48h, congela vendedor e % na venda e
 * registra cada mudança com o evento no mesmo comando. Reprocessar o mesmo id não
 * recalcula nada; só um estorno novo muda a venda.
 */
import type { PoolClient } from "../db";
import { estornoPosFechamento, vendaAtrasada } from "../fechamento";
import { normalizarEventoApp } from "../vendas/eventos-app";
import { normalizarVenda, type VendaNormalizada } from "../vendas/normalizar";
import { categoriaDaVenda, comissaoDaVenda } from "../vendas/regras";
import { avancarPorVendaVinculada, processarEventoApp } from "./app-eventos";
import { ErroPermanente, type Processador } from "./fila";

const EVENTO = `insert into wakeclub.eventos_automacao
  (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo, metadados,
   entidade_tipo, entidade_id, origem_tipo, correlacao_id)`;

async function inserirVenda(
  db: PoolClient,
  v: VendaNormalizada,
  corpoBruto: unknown,
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `with nova as (
       insert into wakeclub.vendas
         (id_externo, comprada_em, valor, cpf, telefone, produto, horas, corpo_bruto)
       values ($1::text, $2::timestamptz, $3::numeric, $4::text, $5::text, $6::text,
               $7::smallint, $8::jsonb)
       on conflict (origem_externa, id_externo) do nothing
       returning id, valor, comprada_em
     ), ev as (
       ${EVENTO}
       select null, 'vendas', 'sale_received', 'webhook', 'venda recebida', null, '{}'::jsonb,
              jsonb_build_object('valor', n.valor, 'comprada_em', n.comprada_em),
              jsonb_build_object('id_externo', $1::text, 'decisoes', $9::jsonb),
              'venda', n.id, 'motor', 'motor:venda:' || n.id::text
         from nova n
     )
     select id from nova`,
    [
      v.idExterno,
      v.compradaEm,
      v.valor,
      v.cpf,
      v.telefone,
      v.produto,
      v.horas,
      JSON.stringify(corpoBruto),
      JSON.stringify(v.decisoes),
    ],
  );
  return rows[0]?.id ?? null;
}

/** Lead da venda (ou do evento do app): CPF primeiro, senão telefone (já em E.164 pelo normalizador). */
export async function cruzar(
  db: PoolClient,
  v: Pick<VendaNormalizada, "cpf" | "telefone">,
): Promise<{ leadId: string; por: "cpf" | "telefone" } | null> {
  const { rows } = await db.query<{ id: string; por: "cpf" | "telefone" }>(
    `select id, por from (
       select id, 'cpf' as por, 1 as ordem from wakeclub.leads
        where $1::text is not null and cpf = $1::text
       union all
       select id, 'telefone', 2 from wakeclub.leads
        where $2::text is not null and telefone = $2::text
     ) c order by ordem limit 1`,
    [v.cpf, v.telefone],
  );
  if (!rows[0]) return null;
  if (rows[0].por === "telefone" && v.cpf) {
    // Grava o CPF para as próximas compras; um CPF já gravado não é trocado.
    await db.query("update wakeclub.leads set cpf = $2::text where id = $1::uuid and cpf is null", [
      rows[0].id,
      v.cpf,
    ]);
  }
  return { leadId: rows[0].id, por: rows[0].por };
}

/**
 * Liga a venda sem dono ao lead, com categoria e comissão do momento. False se já tinha dono.
 * `comprovante`: venda Pix registrada pelo motor ao ler o comprovante (`comprovantes.ts`).
 */
export async function aplicarVinculo(
  db: PoolClient,
  vendaId: string,
  leadId: string,
  quem: "cpf" | "telefone" | "comprovante" | { adminId: string },
): Promise<boolean> {
  const por = typeof quem === "string" ? quem : "admin";
  const metadados = typeof quem === "string" ? {} : { admin_id: quem.adminId };
  const { rows } = await db.query(
    `select v.comprada_em, v.valor, l.atendente_id, u.comissao_pct,
            f.id as followup_id, f.enviado_em, m.id as mensagem_id, m.enviada_em,
            exists (select 1 from wakeclub.vendas a
                     where a.lead_id = l.id and a.status = 'paga' and a.id <> v.id
                       and a.comprada_em < v.comprada_em) as anterior
       from wakeclub.vendas v
       join wakeclub.leads l on l.id = $2::uuid
       left join wakeclub.usuarios u on u.id = l.atendente_id
       left join lateral (
         select id, enviado_em from wakeclub.followups
          where lead_id = l.id and status = 'enviado'
            and enviado_em between v.comprada_em - interval '48 hours' and v.comprada_em
          order by enviado_em desc limit 1) f on true
       left join lateral (
         select id, enviada_em from wakeclub.mensagens
          where lead_id = l.id and direcao = 'equipe'
            and enviada_em between v.comprada_em - interval '48 hours' and v.comprada_em
          order by enviada_em desc limit 1) m on true
      where v.id = $1::uuid`,
    [vendaId, leadId],
  );
  const c = rows[0];
  if (!c) throw new Error("Venda ou lead não encontrado.");
  const { categoria, motivo } = categoriaDaVenda({
    compradaEm: c.comprada_em,
    followupEnviadoEm: c.enviado_em,
    mensagemEquipeEm: c.enviada_em,
    tinhaVendaAnterior: c.anterior,
  });
  const idMotivo =
    categoria === "follow-up" ? c.followup_id : categoria === "atendimento" ? c.mensagem_id : null;
  const pct = c.comissao_pct === null ? null : Number(c.comissao_pct);
  const valorComissao = pct === null ? 0 : comissaoDaVenda(Number(c.valor), pct, categoria);

  const { rowCount } = await db.query(
    `with v as (
       update wakeclub.vendas
          set lead_id = $2::uuid, vinculada_por = $3::text, categoria = $4::text,
              categoria_motivo = $5::text, vendedor_id = $6::uuid, comissao_pct = $7::numeric,
              comissao_valor = $8::numeric
        where id = $1::uuid and lead_id is null
       returning id, lead_id
     )
     ${EVENTO}
     select v.lead_id, 'vendas', 'sale_linked',
            case when $3::text = 'admin' then 'admin'
                 when $3::text = 'comprovante' then 'motor' else 'webhook' end,
            'venda ligada ao lead por ' || $3::text, $9::text,
            jsonb_build_object('lead_id', null),
            jsonb_build_object('lead_id', v.lead_id, 'categoria', $4::text,
                               'vendedor_id', $6::uuid, 'comissao_pct', $7::numeric,
                               'comissao_valor', $8::numeric),
            $10::jsonb || jsonb_build_object('vinculada_por', $3::text,
                                             'categoria_motivo', $5::text),
            'venda', v.id, 'motor', 'motor:venda:' || v.id::text
       from v`,
    [
      vendaId,
      leadId,
      por,
      categoria,
      idMotivo ?? motivo,
      c.atendente_id,
      pct,
      valorComissao,
      motivo,
      JSON.stringify(metadados),
    ],
  );
  return rowCount === 1;
}

/**
 * Estorno (webhook com `adminId` nulo, ou manual). Venda já num fechamento ganha a marca
 * `pos_fechamento` e o lançamento negativo de `estornoPosFechamento`. False se já estava
 * estornada ou não existe.
 */
export async function estornar(
  db: PoolClient,
  vendaId: string,
  adminId: string | null,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `with e as (
       update wakeclub.vendas set status = 'estornada', estornada_em = now()
        where id = $1::uuid and status = 'paga'
       returning id, lead_id, fechamento_id
     )
     ${EVENTO}
     select e.lead_id, 'vendas', 'sale_refunded',
            case when $2::uuid is null then 'webhook' else 'admin' end,
            'venda estornada', null,
            jsonb_build_object('status', 'paga'), jsonb_build_object('status', 'estornada'),
            jsonb_strip_nulls(jsonb_build_object('admin_id', $2::uuid))
              || jsonb_build_object('pos_fechamento', e.fechamento_id is not null),
            'venda', e.id, 'motor', 'motor:venda:' || e.id::text
       from e`,
    [vendaId, adminId],
  );
  if (rowCount !== 1) return false;
  await estornoPosFechamento(db, vendaId);
  return true;
}

export async function processarVenda(
  db: PoolClient,
  v: VendaNormalizada,
  corpoBruto: unknown,
): Promise<{ vendaId: string; nova: boolean }> {
  let vendaId = await inserirVenda(db, v, corpoBruto);
  const nova = vendaId !== null;
  if (vendaId === null) {
    const { rows } = await db.query<{ id: string }>(
      `select id from wakeclub.vendas
        where origem_externa = 'webhook' and id_externo = $1::text`,
      [v.idExterno],
    );
    vendaId = rows[0].id;
  } else {
    const casou = await cruzar(db, v);
    if (casou) await aplicarVinculo(db, vendaId, casou.leadId, casou.por);
  }
  if (v.status === "estornada") await estornar(db, vendaId, null);
  else if (nova) await vendaAtrasada(db, vendaId);
  return { vendaId, nova };
}

/** Vínculo manual pelo admin de uma venda sem dono. */
export async function vincular(
  db: PoolClient,
  vendaId: string,
  leadId: string,
  adminId: string,
): Promise<void> {
  if (!(await aplicarVinculo(db, vendaId, leadId, { adminId }))) {
    throw new Error("Venda já tem dono ou não existe.");
  }
  await vendaAtrasada(db, vendaId);
  // Como no casamento por telefone: o CPF da venda fica no lead para as próximas compras.
  await db.query(
    `update wakeclub.leads l set cpf = v.cpf
       from wakeclub.vendas v
      where v.id = $1::uuid and l.id = $2::uuid and l.cpf is null and v.cpf is not null`,
    [vendaId, leadId],
  );
  const { rows } = await db.query<{ horas: number | null; status: string; ja_creditada: boolean }>(
    `select v.horas, v.status,
            exists (select 1 from wakeclub.app_eventos a
                     where a.tipo = 'compra_paga' and a.chave = btrim(v.id_externo)
                       and a.resultado = 'aplicado') as ja_creditada
       from wakeclub.vendas v where v.id = $1::uuid`,
    [vendaId],
  );
  // Venda paga ligada pelo admin move etapa e saldo como a compra paga do app, salvo se o
  // evento do app já creditou essas horas (achou o lead pelo app_user_id).
  if (rows[0]?.status === "paga" && !rows[0].ja_creditada)
    await avancarPorVendaVinculada(db, leadId, rows[0].horas);
}

/** Envelope `{ event: "USER_*", data }` do app; o resto segue o formato flat de venda. */
const ehEnvelopeApp = (c: unknown): boolean =>
  typeof c === "object" &&
  c !== null &&
  typeof (c as { event?: unknown }).event === "string" &&
  /^USER_/.test((c as { event: string }).event) &&
  typeof (c as { data?: unknown }).data === "object" &&
  (c as { data?: unknown }).data !== null;

/** Processador da origem `vendas`: formato não entendido vai direto a `falhou`, sem retentativa. */
export function criarProcessadorVendas(): Processador {
  return async (db, evento) => {
    if (ehEnvelopeApp(evento.corpo)) {
      const ev = normalizarEventoApp(evento.corpo);
      if ("erro" in ev) throw new ErroPermanente(ev.erro);
      if ("ignorar" in ev) return "ignorado"; // teste ou evento sem efeito; o corpo bruto já está na fila
      if (ev.tipo === "compra_paga") {
        const v = normalizarVenda(evento.corpo);
        if ("erro" in v) throw new ErroPermanente(v.erro);
        if ("ignorar" in v) return "ignorado";
        // A venda liga o lead primeiro; o evento do app usa o mesmo lead (venda e horas juntas).
        const { vendaId } = await processarVenda(db, v, evento.corpo);
        const { rows } = await db.query<{ lead_id: string | null }>(
          "select lead_id from wakeclub.vendas where id = $1::uuid",
          [vendaId],
        );
        return processarEventoApp(db, ev, evento.corpo, {
          leadIdConhecido: rows[0]?.lead_id ?? null,
        });
      }
      return processarEventoApp(db, ev, evento.corpo);
    }
    const v = normalizarVenda(evento.corpo);
    if ("erro" in v) throw new ErroPermanente(v.erro);
    if ("ignorar" in v) return "ignorado";
    await processarVenda(db, v, evento.corpo);
    return "processado";
  };
}
