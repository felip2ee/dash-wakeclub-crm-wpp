/**
 * Comprovantes de Pix mandados pelo lead no WhatsApp viram venda direta (spec vendas Pix §3, §10b).
 *
 * Existe porque parte das vendas é paga por Pix fora do app e não entrava no CRM. A tarefa lê
 * imagens e PDFs do lead com a IA, deduz as horas pela conversa e decide: registra sozinho só
 * quando tudo confere; senão vira pergunta ao admin. Nunca conta a mesma venda duas vezes (mesmo
 * arquivo, mesmo E2E, ou mesmo lead + valor + hora). Nada vai ao cliente. Log sem conteúdo do
 * comprovante (nome, CPF, chave).
 */
import { createHash } from "node:crypto";

import { moeda, telefone } from "../../lib/formato";
import { type ClienteDb, comTransacao, getPoolMotor, type PoolClient } from "../db";
import type { AdaptadorEvolution } from "../evolution/tipos";
import { vendaAtrasada } from "../fechamento";
import { anexoSuportado } from "../ia/openai";
import {
  SCHEMA_HORAS,
  SCHEMA_LEITURA,
  SISTEMA_HORAS,
  SISTEMA_LEITURA,
  VERSAO_PROMPT,
} from "../ia/prompts/comprovante";
import type { ClienteIa } from "../ia/tipos";
import { logErro } from "../log";
import { avancarPorVendaVinculada } from "./app-eventos";
import { aplicarVinculo } from "./vendas";

// Mesmo modelo do qualificador; lê imagem e PDF.
const MODELO = "gpt-5.4-mini";
const PACOTES = [1, 2, 4] as const;
const DIA_MS = 24 * 3600_000;
const FOLGA_FUTURO_MS = 10 * 60_000;

export type ConfigPix = {
  chave: string | null;
  cnpj: string | null;
  precos: { 1: number | null; 2: number | null; 4: number | null };
};

export type Leitura = {
  ehComprovante: boolean;
  valor: number | null;
  pagoEm: string | null;
  pagador: string | null;
  recebedor: string | null;
  chaveRecebedor: string | null;
  cnpjRecebedor: string | null;
  e2e: string | null;
  legivel: boolean;
};

export type Decisao =
  | { acao: "registrar"; horas: 1 | 2 | 4 }
  | { acao: "confirmar"; motivo: string };

const textoOuNulo = (x: unknown): string | null =>
  typeof x === "string" && x.trim() ? x.trim().slice(0, 200) : null;

const precoOuNulo = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function lerConfigPix(db: ClienteDb): Promise<ConfigPix> {
  const { rows } = await db.query<{ valor: Record<string, unknown> }>(
    "select valor from wakeclub.configuracoes where chave = 'venda_pix'",
  );
  const v = rows[0]?.valor ?? {};
  const p = (typeof v.precos === "object" && v.precos !== null ? v.precos : {}) as Record<
    string,
    unknown
  >;
  return {
    chave: textoOuNulo(v.chave),
    cnpj: textoOuNulo(v.cnpj),
    precos: { 1: precoOuNulo(p["1"]), 2: precoOuNulo(p["2"]), 4: precoOuNulo(p["4"]) },
  };
}

/** "YYYY-MM-DD HH:MM" no horário de Brasília (sem horário de verão desde 2019) para ISO. */
function dataDeBrasilia(x: unknown): string | null {
  const m =
    typeof x === "string" ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/.exec(x.trim()) : null;
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${m[3] ?? ":00"}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Resposta da IA (fronteira não confiável) para `Leitura`; o que não tiver o tipo certo vira null. */
export function normalizarLeitura(cru: unknown): Leitura {
  const o = (typeof cru === "object" && cru !== null ? cru : {}) as Record<string, unknown>;
  const valor =
    typeof o.valor === "number" && Number.isFinite(o.valor) && o.valor > 0
      ? Math.round(o.valor * 100) / 100
      : null;
  const e2e = textoOuNulo(o.e2e)?.replace(/\s+/g, "").toUpperCase() || null;
  return {
    ehComprovante: o.eh_comprovante === true,
    valor,
    pagoEm: dataDeBrasilia(o.pago_em),
    pagador: textoOuNulo(o.pagador),
    recebedor: textoOuNulo(o.recebedor),
    chaveRecebedor: textoOuNulo(o.chave_recebedor),
    cnpjRecebedor: textoOuNulo(o.cnpj_recebedor),
    e2e,
    legivel: o.legivel === true && valor !== null,
  };
}

// Chave e CNPJ comparados só por dígitos e letras minúsculas: máscara e caixa não importam.
const normalizar = (s: string | null) => (s ?? "").toLowerCase().replace(/[^0-9a-z]/g, "");
const centavos = (n: number) => Math.round(n * 100);
const valorBr = (n: number) => n.toFixed(2).replace(".", ",");

/** Regra pura do registro automático (spec §3.5): o primeiro critério que falhar vira o motivo. */
export function decidir(
  l: Leitura,
  horasDeduzidas: number | null,
  ctx: { config: ConfigPix; agora: Date; vendaAppParecida: boolean; leadComDono: boolean },
): Decisao {
  const confirmar = (motivo: string): Decisao => ({ acao: "confirmar", motivo });
  const { config } = ctx;
  const wake = [config.chave, config.cnpj].map(normalizar).filter(Boolean);
  if (wake.length === 0 || PACOTES.some((h) => config.precos[h] === null))
    return confirmar("configure a chave Pix e os preços dos pacotes");

  const pago = l.pagoEm ? new Date(l.pagoEm).getTime() : NaN;
  if (
    !l.ehComprovante ||
    !l.legivel ||
    l.valor === null ||
    !Number.isFinite(pago) ||
    pago > ctx.agora.getTime() + FOLGA_FUTURO_MS
  )
    return confirmar("comprovante ilegível");

  const lidos = [l.chaveRecebedor, l.cnpjRecebedor].map(normalizar).filter(Boolean);
  if (!lidos.some((x) => wake.includes(x)))
    return confirmar("recebedor não confere com a chave/CNPJ da Wake");

  const valor = l.valor;
  const pacotes = PACOTES.filter((h) => centavos(config.precos[h] ?? 0) === centavos(valor));
  if (pacotes.length !== 1)
    return confirmar(`valor R$ ${valorBr(valor)} não bate com nenhum pacote`);
  const horas = pacotes[0];
  if (horasDeduzidas !== horas)
    return confirmar(`horas da conversa (${horasDeduzidas ?? "?"} h) não batem com o valor`);
  if (ctx.agora.getTime() - pago > 3 * DIA_MS) return confirmar("pagamento de mais de 3 dias");
  if (ctx.vendaAppParecida) return confirmar("possível venda repetida com venda do app");
  if (!ctx.leadComDono) return confirmar("lead sem dono");
  return { acao: "registrar", horas };
}

const EVENTO = `insert into wakeclub.eventos_automacao
  (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo, metadados,
   entidade_tipo, entidade_id, origem_tipo, correlacao_id, modelo, versao_prompt)`;

/**
 * Registra a venda Pix paga do comprovante (motor ou admin): mesmo caminho da venda paga ligada
 * ao lead (vínculo com categoria e comissão do dono atual, comissão atrasada, etapa e saldo).
 * Roda na transação do chamador; o comprovante já decidido lança.
 */
export async function registrarVendaPix(
  db: PoolClient,
  c: {
    comprovanteId: string;
    leadId: string;
    valor: number;
    horas: number;
    pagoEm: Date;
    e2e: string | null;
    evolutionMsgId: string | null;
    por: "comprovante" | { adminId: string };
  },
): Promise<string> {
  const { rows: atual } = await db.query<{ status: string; venda_id: string | null }>(
    "select status, venda_id from wakeclub.comprovantes where id = $1::uuid for update",
    [c.comprovanteId],
  );
  const st = atual[0];
  if (!st || st.venda_id !== null || !["lendo", "confirmar"].includes(st.status))
    throw new Error("Comprovante já decidido ou não existe.");

  const idExterno =
    c.e2e ?? (c.evolutionMsgId ? `msg:${c.evolutionMsgId}` : `comprovante:${c.comprovanteId}`);
  // Sem lead_id no insert: `aplicarVinculo` só liga venda sem dono.
  const { rows } = await db.query<{ id: string }>(
    `insert into wakeclub.vendas
       (origem_externa, id_externo, comprada_em, valor, telefone, produto, horas, status)
     select 'pix', $1::text, $2::timestamptz, $3::numeric, l.telefone,
            'Pacote de ' || $4::int || ' h (Pix)', $4::smallint, 'paga'
       from wakeclub.leads l where l.id = $5::uuid
     returning id`,
    [idExterno, c.pagoEm.toISOString(), c.valor, c.horas, c.leadId],
  );
  const vendaId = rows[0]?.id;
  if (!vendaId) throw new Error("Lead não encontrado.");
  if (!(await aplicarVinculo(db, vendaId, c.leadId, c.por)))
    throw new Error("Venda Pix não ligou ao lead.");
  await vendaAtrasada(db, vendaId);
  await avancarPorVendaVinculada(
    db,
    c.leadId,
    c.horas,
    c.por === "comprovante" ? "motor" : "admin",
  );

  const adminId = c.por === "comprovante" ? null : c.por.adminId;
  await db.query(
    `with u as (
       update wakeclub.comprovantes
          set status = 'registrado', venda_id = $2::uuid, valor = $3::numeric,
              pago_em = $4::timestamptz, e2e = $5::text, decidido_por = $6::uuid,
              decidido_em = now()
        where id = $1::uuid
       returning id, lead_id
     )
     ${EVENTO}
     select u.lead_id, 'comprovantes', 'sale_registered',
            case when $6::uuid is null then 'motor' else 'admin' end,
            'venda Pix registrada', null, jsonb_build_object('status', $7::text),
            jsonb_build_object('status', 'registrado', 'venda_id', $2::uuid,
                               'valor', $3::numeric, 'horas', $8::int),
            jsonb_strip_nulls(jsonb_build_object('admin_id', $6::uuid)),
            'comprovante', u.id, 'motor', 'motor:comprovante:' || u.id::text, null, null
       from u`,
    [c.comprovanteId, vendaId, c.valor, c.pagoEm.toISOString(), c.e2e, adminId, st.status, c.horas],
  );
  return vendaId;
}

type Item = {
  id: string;
  mensagem_id: string;
  lead_id: string;
  evolution_msg_id: string;
  enviada_em: Date;
};

/**
 * Até `limite` por rodada: primeiro as que falharam (ou ficaram órfãs há 15 min), depois as
 * mensagens novas de imagem/PDF do lead dos últimos 7 dias. Órfã já na 3ª tentativa desiste.
 */
async function reivindicar(db: ClienteDb, limite = 5): Promise<Item[]> {
  await db.query(
    `with f as (
       update wakeclub.comprovantes
          set status = 'falhou', motivo = 'desistiu apos 3 tentativas'
        where status = 'lendo' and tentativas >= 3 and motivo is null
          and atualizado_em < now() - interval '15 minutes'
       returning id, lead_id
     )
     ${EVENTO}
     select f.lead_id, 'comprovantes', 'receipt_failed', 'motor', 'leitura desistiu', null,
            jsonb_build_object('status', 'lendo'), jsonb_build_object('status', 'falhou'),
            '{}'::jsonb, 'comprovante', f.id, 'motor', 'motor:comprovante:' || f.id::text,
            null, null
       from f`,
  );
  const retomadas = await db.query<Item>(
    `with alvo as (
       select c.id from wakeclub.comprovantes c
        where c.status = 'lendo' and c.tentativas < 3
          and (c.motivo is not null or c.atualizado_em < now() - interval '15 minutes')
        order by c.criado_em desc
        limit $1::int
        for update skip locked
     )
     update wakeclub.comprovantes c
        set tentativas = c.tentativas + 1, motivo = null
       from alvo a, wakeclub.mensagens m
      where c.id = a.id and m.id = c.mensagem_id
     returning c.id, c.mensagem_id, c.lead_id, m.evolution_msg_id, m.enviada_em`,
    [limite],
  );
  const novas = await db.query<Item>(
    `with alvo as (
       select m.id, m.lead_id from wakeclub.mensagens m
        where m.direcao = 'lead' and m.tipo in ('imagem', 'documento')
          and m.enviada_em > now() - interval '7 days'
          and m.evolution_msg_id is not null
          and not exists (select 1 from wakeclub.comprovantes c where c.mensagem_id = m.id)
        order by m.enviada_em desc
        limit $1::int
        for update of m skip locked
     ), novas as (
       insert into wakeclub.comprovantes (mensagem_id, lead_id, status, tentativas)
       select id, lead_id, 'lendo', 1 from alvo
       on conflict (mensagem_id) do nothing
       returning id, mensagem_id, lead_id
     )
     select n.id, n.mensagem_id, n.lead_id, m.evolution_msg_id, m.enviada_em
       from novas n join wakeclub.mensagens m on m.id = n.mensagem_id`,
    [limite - retomadas.rows.length],
  );
  return [...retomadas.rows, ...novas.rows];
}

type Fechamento = {
  status: "nao_e" | "repetido" | "confirmar";
  tipoEvento: string;
  decisao: string;
  motivo?: string | null;
  hash: string;
  leitura?: Record<string, unknown> | null;
  e2e?: string | null;
  valor?: number | null;
  pagoEm?: string | null;
  horas?: number | null;
  repetidoDe?: string | null;
  vendaSuspeitaId?: string | null;
  metadados?: Record<string, unknown>;
  leuComIa?: boolean;
};

/** Grava a decisão do comprovante ainda `lendo` e o evento no mesmo comando. */
async function fechar(db: ClienteDb, id: string, f: Fechamento): Promise<boolean> {
  const { rowCount } = await db.query(
    `with c as (
       update wakeclub.comprovantes
          set status = $2::text, hash = $3::text, leitura = $4::jsonb, e2e = $5::text,
              valor = $6::numeric, pago_em = $7::timestamptz, horas_sugeridas = $8::int,
              motivo = $9::text, repetido_de = $10::uuid, venda_suspeita_id = $11::uuid
        where id = $1::uuid and status = 'lendo'
       returning id, lead_id
     )
     ${EVENTO}
     select c.lead_id, 'comprovantes', $12::text, 'motor', $13::text, $9::text,
            jsonb_build_object('status', 'lendo'),
            jsonb_strip_nulls(jsonb_build_object('status', $2::text, 'valor', $6::numeric,
                                                 'horas_sugeridas', $8::int,
                                                 'repetido_de', $10::uuid,
                                                 'venda_suspeita_id', $11::uuid)),
            $14::jsonb, 'comprovante', c.id, 'motor', 'motor:comprovante:' || c.id::text,
            $15::text, $16::text
       from c`,
    [
      id,
      f.status,
      f.hash,
      f.leitura ? JSON.stringify(f.leitura) : null,
      f.e2e ?? null,
      f.valor ?? null,
      f.pagoEm ?? null,
      f.horas ?? null,
      f.motivo ?? null,
      f.repetidoDe ?? null,
      f.vendaSuspeitaId ?? null,
      f.tipoEvento,
      f.decisao,
      JSON.stringify(f.metadados ?? {}),
      f.leuComIa ? MODELO : null,
      f.leuComIa ? VERSAO_PROMPT : null,
    ],
  );
  return rowCount === 1;
}

/**
 * Mesmo E2E em outro comprovante ou em qualquer venda (de qualquer origem, estornada também);
 * ou mesmo lead + valor + pagamento a até 10 min de outro comprovante quando um dos dois não tem E2E.
 */
async function acharRepetido(
  db: ClienteDb,
  it: Item,
  { e2e, valor, pagoEm }: { e2e: string | null; valor: number | null; pagoEm: string },
): Promise<{ comprovanteId: string | null; vendaId: string | null; por: string } | null> {
  if (e2e) {
    const { rows } = await db.query<{ comprovante_id: string | null; venda_id: string | null }>(
      `select (select id from wakeclub.comprovantes
                where e2e = $2::text and id <> $1::uuid order by criado_em limit 1) as comprovante_id,
              (select id from wakeclub.vendas where id_externo = $2::text limit 1) as venda_id`,
      [it.id, e2e],
    );
    const r = rows[0];
    if (r?.comprovante_id || r?.venda_id)
      return { comprovanteId: r.comprovante_id, vendaId: r.venda_id, por: "e2e" };
  }
  if (valor === null) return null;
  const { rows } = await db.query<{ id: string }>(
    `select id from wakeclub.comprovantes
      where lead_id = $2::uuid and valor = $3::numeric and id <> $1::uuid
        and (e2e is null or $5::text is null)
        and pago_em between $4::timestamptz - interval '10 minutes'
                        and $4::timestamptz + interval '10 minutes'
      order by criado_em limit 1`,
    [it.id, it.lead_id, valor, pagoEm, e2e],
  );
  return rows[0] ? { comprovanteId: rows[0].id, vendaId: null, por: "valor_hora" } : null;
}

async function deduzirHoras(
  ia: ClienteIa,
  db: ClienteDb,
  leadId: string,
  config: ConfigPix,
): Promise<{ horas: 1 | 2 | 4 | null; trecho: string }> {
  const { rows } = await db.query<{ direcao: string; em: string; texto: string }>(
    `select direcao, to_char(enviada_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as em,
            texto
       from (select direcao, enviada_em, texto from wakeclub.mensagens
              where lead_id = $1::uuid and texto is not null
              order by enviada_em desc limit 30) h
      order by enviada_em`,
    [leadId],
  );
  const precos = PACOTES.map((h) => {
    const p = config.precos[h];
    return `${h} h: ${p === null ? "preço não configurado" : `R$ ${valorBr(p)}`}`;
  }).join("\n");
  const conversa =
    rows
      .map((m) => `[${m.em}] ${m.direcao === "lead" ? "LEAD" : "EQUIPE"}: ${m.texto}`)
      .join("\n") || "(nenhuma mensagem)";
  const cru = await ia.chatJson<{ horas?: unknown; trecho?: unknown }>({
    modelo: MODELO,
    sistema: SISTEMA_HORAS,
    usuario: `PACOTES\n${precos}\n\nCONVERSA (mais antiga primeiro)\n${conversa}`,
    schema: SCHEMA_HORAS,
    nomeSchema: "horas_do_pix",
    reasoningEffort: "low",
    timeoutMs: 60_000,
  });
  const horas = PACOTES.find((h) => h === cru?.horas) ?? null;
  return { horas, trecho: typeof cru?.trecho === "string" ? cru.trecho.slice(0, 300) : "" };
}

/** Uma notificação por admin ativo (o push agrupa por destinatário). */
export async function notificarAdmins(db: PoolClient, leadId: string, valor: number | null) {
  const { rows } = await db.query<{ nome: string | null; tel: string }>(
    "select nome, telefone as tel from wakeclub.leads where id = $1::uuid",
    [leadId],
  );
  const lead = rows[0];
  const quem = lead?.nome?.trim() || (lead ? telefone(lead.tel) : "lead");
  await db.query(
    `insert into wakeclub.notificacoes (usuario_id, tipo, titulo, corpo, url)
     select u.id, 'comprovante', 'Comprovante para confirmar', $1::text, '/vendas'
       from wakeclub.usuarios u where u.papel = 'admin' and u.ativo = true`,
    [`${quem} · ${valor === null ? "valor não lido" : moeda(valor)}`],
  );
}

const ehUnicoViolado = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23505";

async function processar(
  deps: { ia: ClienteIa; adaptador: AdaptadorEvolution },
  it: Item,
  agora: Date,
): Promise<void> {
  const db = getPoolMotor();
  const midia = await deps.adaptador.baixarMidia(it.evolution_msg_id);
  if (!midia) throw new Error("mídia indisponível");
  const hash = createHash("sha256").update(midia.dados).digest("hex");

  const { rows: mesmoArquivo } = await db.query<{ id: string }>(
    `select id from wakeclub.comprovantes
      where hash = $1::text and id <> $2::uuid and status in ('registrado', 'confirmar', 'recusado')
      order by criado_em limit 1`,
    [hash, it.id],
  );
  if (mesmoArquivo[0]) {
    await fechar(db, it.id, {
      status: "repetido",
      tipoEvento: "receipt_repeated",
      decisao: "mesmo arquivo de outro comprovante",
      hash,
      repetidoDe: mesmoArquivo[0].id,
    });
    return;
  }
  // Formato que a IA não lê (HEIC, vídeo, docx): encerra sem gastar as tentativas.
  if (!anexoSuportado(midia.mime)) {
    await fechar(db, it.id, {
      status: "nao_e",
      tipoEvento: "receipt_not_receipt",
      decisao: "arquivo em formato que a IA não lê",
      motivo: `formato ${midia.mime.split(";")[0].trim().slice(0, 60)}`,
      hash,
    });
    return;
  }

  const pdf = midia.mime.includes("pdf");
  const leitura = normalizarLeitura(
    await deps.ia.chatJson<unknown>({
      modelo: MODELO,
      sistema: SISTEMA_LEITURA,
      usuario: "Leia o arquivo anexo.",
      anexos: [
        {
          mime: midia.mime,
          dados: midia.dados,
          nomeArquivo: pdf ? "comprovante.pdf" : "comprovante",
        },
      ],
      schema: SCHEMA_LEITURA,
      nomeSchema: "comprovante_pix",
      reasoningEffort: "low",
      timeoutMs: 60_000,
    }),
  );
  if (!leitura.ehComprovante) {
    await fechar(db, it.id, {
      status: "nao_e",
      tipoEvento: "receipt_not_receipt",
      decisao: "não é comprovante de Pix",
      hash,
      leuComIa: true,
    });
    return;
  }

  // Sem hora legível, vale a hora da mensagem (spec §10b).
  const pagoEm = leitura.pagoEm ?? new Date(it.enviada_em).toISOString();
  const comum = { hash, e2e: leitura.e2e, valor: leitura.valor, pagoEm, leuComIa: true };
  const repetidoDe = async () => {
    const r = await acharRepetido(db, it, { e2e: leitura.e2e, valor: leitura.valor, pagoEm });
    if (!r) return false;
    await fechar(db, it.id, {
      ...comum,
      status: "repetido",
      tipoEvento: "receipt_repeated",
      decisao:
        r.por === "e2e" ? "mesmo E2E de outra venda" : "mesmo valor e hora de outro comprovante",
      leitura: { ...leitura },
      repetidoDe: r.comprovanteId,
      metadados: { por: r.por, venda_id: r.vendaId },
    });
    return true;
  };
  if (await repetidoDe()) return;

  const config = await lerConfigPix(db);
  const deducao = await deduzirHoras(deps.ia, db, it.lead_id, config);
  const { rows: lead } = await db.query<{ com_dono: boolean; parecida: string | null }>(
    `select l.atendente_id is not null as com_dono,
            (select v.id from wakeclub.vendas v
              where v.lead_id = l.id and v.status = 'paga' and v.origem_externa <> 'pix'
                and $2::numeric is not null and v.valor = $2::numeric
                and v.comprada_em >= $3::timestamptz - interval '48 hours'
              order by v.comprada_em desc limit 1) as parecida
       from wakeclub.leads l where l.id = $1::uuid`,
    [it.lead_id, leitura.valor, pagoEm],
  );
  const d = decidir({ ...leitura, pagoEm }, deducao.horas, {
    config,
    agora,
    vendaAppParecida: lead[0]?.parecida != null,
    leadComDono: lead[0]?.com_dono === true,
  });
  const leituraGravada = { ...leitura, trechoHoras: deducao.trecho };

  if (d.acao === "registrar" && leitura.valor !== null) {
    const valor = leitura.valor;
    try {
      await comTransacao(async (c) => {
        await c.query(
          `update wakeclub.comprovantes
              set hash = $2::text, leitura = $3::jsonb, horas_sugeridas = $4::int
            where id = $1::uuid and status = 'lendo'`,
          [it.id, hash, JSON.stringify(leituraGravada), deducao.horas],
        );
        await registrarVendaPix(c, {
          comprovanteId: it.id,
          leadId: it.lead_id,
          valor,
          horas: d.horas,
          pagoEm: new Date(pagoEm),
          e2e: leitura.e2e,
          evolutionMsgId: it.evolution_msg_id,
          por: "comprovante",
        });
      });
      return;
    } catch (erro) {
      // Corrida: outro comprovante ou venda com o mesmo E2E entrou entre a checagem e o registro.
      if (ehUnicoViolado(erro) && (await repetidoDe())) return;
      throw erro;
    }
  }

  await comTransacao(async (c) => {
    const fechou = await fechar(c, it.id, {
      ...comum,
      status: "confirmar",
      tipoEvento: "receipt_needs_confirmation",
      decisao: "comprovante para o admin confirmar",
      motivo: d.acao === "confirmar" ? d.motivo : "comprovante ilegível",
      leitura: leituraGravada,
      horas: deducao.horas,
      vendaSuspeitaId: lead[0]?.parecida ?? null,
    });
    if (fechou) await notificarAdmins(c, it.lead_id, leitura.valor);
  });
}

export async function tarefaComprovantes(deps: {
  ia: ClienteIa;
  adaptador: AdaptadorEvolution;
  agora?: () => Date;
}): Promise<number> {
  const db = getPoolMotor();
  const itens = await reivindicar(db);
  for (const it of itens) {
    try {
      await processar(deps, it, deps.agora?.() ?? new Date());
    } catch (erro) {
      // Só `message` e o id: nada do que a IA leu vai para log.
      const msg = erro instanceof Error ? erro.message : String(erro);
      logErro("comprovantes.falha", erro, { comprovanteId: it.id });
      await db.query(
        `with c as (
           update wakeclub.comprovantes
              set status = case when tentativas >= 3 then 'falhou' else 'lendo' end,
                  motivo = left($2::text, 300)
            where id = $1::uuid and status = 'lendo'
           returning id, lead_id, status
         )
         ${EVENTO}
         select c.lead_id, 'comprovantes', 'receipt_failed', 'motor', 'leitura falhou 3 vezes',
                left($2::text, 300), jsonb_build_object('status', 'lendo'),
                jsonb_build_object('status', 'falhou'), '{}'::jsonb, 'comprovante', c.id, 'motor',
                'motor:comprovante:' || c.id::text, null, null
           from c where c.status = 'falhou'`,
        [it.id, msg],
      );
    }
  }
  return itens.length;
}
