/**
 * Venda direta por Pix no admin (spec vendas Pix §4, §5, §10b): o cartão de Configurações
 * (chave, CNPJ e preços dos pacotes) e a lista "Vendas para confirmar" em /vendas.
 *
 * Existe porque o motor só registra sozinho o comprovante que confere; o resto vira pergunta e
 * quem responde é o admin. Confirmar reusa `registrarVendaPix` (mesmo caminho do motor); "Não é
 * venda" numa venda já registrada estorna pelo `estornar` atual e devolve as horas do saldo.
 * Tudo grava pelo pool do motor (sem grant novo para painel_rw), cada decisão com o evento na
 * mesma transação. O SQL fica em helpers que recebem o cliente, para testar sem cookie.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { type ClienteDb, comTransacao, getPoolMotor, type PoolClient } from "./db";
import {
  type ConfigPix,
  type Leitura,
  lerConfigPix,
  registrarVendaPix,
} from "./motor/comprovantes";
import { estornar } from "./motor/vendas";

// Entidade fixa dos eventos de configuração (migração 0004), a mesma do ritmo e dos prazos.
const CONFIG_ID = "00000000-0000-0000-0000-000000000001";

export type VendaResumo = {
  id: string;
  valor: number;
  horas: number | null;
  compradaEm: string;
  status: "paga" | "estornada";
  origem: "app" | "direta";
};

export type Pergunta = {
  id: string;
  /** Mensagem do comprovante (miniatura em /api/midia); nula na "possível venda repetida". */
  mensagemId: string | null;
  midiaTipo: string | null;
  leadId: string;
  leadNome: string | null;
  leadTelefone: string;
  donoNome: string | null;
  leitura: (Partial<Leitura> & { trechoHoras?: string }) | null;
  valor: number | null;
  pagoEm: string | null;
  horasSugeridas: number | null;
  motivo: string | null;
  criadoEm: string;
  /** Na repetida: a venda direta já registrada. */
  venda: VendaResumo | null;
  /** Venda do app parecida (na repetida, a que chegou depois da direta). */
  vendaSuspeita: VendaResumo | null;
};

export type Registrada = {
  id: string;
  mensagemId: string | null;
  midiaTipo: string | null;
  leadId: string;
  leadNome: string | null;
  leadTelefone: string;
  donoNome: string | null;
  valor: number;
  horas: number | null;
  pagoEm: string;
  registradaEm: string;
};

export type ParaConfirmar = { perguntas: Pergunta[]; registradasRecentes: Registrada[] };

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
const numOuNull = (n: unknown) => (n === null || n === undefined ? null : Number(n));

function vendaResumo(j: unknown): VendaResumo | null {
  if (!j) return null;
  const v = j as Record<string, unknown>;
  return {
    id: v.id as string,
    valor: Number(v.valor),
    horas: numOuNull(v.horas),
    compradaEm: iso(v.comprada_em) as string,
    status: v.status as VendaResumo["status"],
    origem: v.origem_externa === "pix" ? "direta" : "app",
  };
}

const VENDA_JSON = (col: string) =>
  `(select json_build_object('id', v.id, 'valor', v.valor, 'horas', v.horas,
                             'comprada_em', v.comprada_em, 'status', v.status,
                             'origem_externa', v.origem_externa)
      from wakeclub.vendas v where v.id = ${col})`;

const BASE = `from wakeclub.comprovantes c
  join wakeclub.leads l on l.id = c.lead_id
  left join wakeclub.usuarios u on u.id = l.atendente_id
  left join wakeclub.mensagens m on m.id = c.mensagem_id`;

/** Perguntas abertas (não expiram) e o que o motor registrou sozinho nos últimos 7 dias. */
export async function lerParaConfirmar(db: ClienteDb): Promise<ParaConfirmar> {
  const perguntas = await db.query(
    `select c.id, c.mensagem_id, m.tipo as midia_tipo, c.lead_id, l.nome as lead_nome,
            l.telefone as lead_telefone, u.nome as dono_nome, c.leitura, c.valor, c.pago_em,
            c.horas_sugeridas, c.motivo, c.criado_em,
            ${VENDA_JSON("c.venda_id")} as venda,
            ${VENDA_JSON("c.venda_suspeita_id")} as venda_suspeita
       ${BASE}
      where c.status = 'confirmar'
      order by c.criado_em
      limit 200`,
  );
  const registradas = await db.query(
    `select c.id, c.mensagem_id, m.tipo as midia_tipo, c.lead_id, l.nome as lead_nome,
            l.telefone as lead_telefone, u.nome as dono_nome, v.valor, v.horas,
            v.comprada_em, c.decidido_em
       ${BASE}
       join wakeclub.vendas v on v.id = c.venda_id
      where c.status = 'registrado' and c.decidido_por is null
        and c.decidido_em > now() - interval '7 days' and v.status = 'paga'
      order by c.decidido_em desc
      limit 200`,
  );
  const comum = (r: Record<string, unknown>) => ({
    id: r.id as string,
    mensagemId: r.mensagem_id as string | null,
    midiaTipo: r.midia_tipo as string | null,
    leadId: r.lead_id as string,
    leadNome: r.lead_nome as string | null,
    leadTelefone: r.lead_telefone as string,
    donoNome: r.dono_nome as string | null,
  });
  return {
    perguntas: perguntas.rows.map((r) => ({
      ...comum(r),
      leitura: (r.leitura as Pergunta["leitura"]) ?? null,
      valor: numOuNull(r.valor),
      pagoEm: iso(r.pago_em),
      horasSugeridas: numOuNull(r.horas_sugeridas),
      motivo: r.motivo as string | null,
      criadoEm: iso(r.criado_em) as string,
      venda: vendaResumo(r.venda),
      vendaSuspeita: vendaResumo(r.venda_suspeita),
    })),
    registradasRecentes: registradas.rows.map((r) => ({
      ...comum(r),
      valor: Number(r.valor),
      horas: numOuNull(r.horas),
      pagoEm: iso(r.comprada_em) as string,
      registradaEm: iso(r.decidido_em) as string,
    })),
  };
}

const texto140 = z
  .string()
  .trim()
  .max(140, "Até 140 caracteres.")
  .nullable()
  .transform((s) => (s ? s : null));
const preco = z
  .number()
  .min(0.01, "O preço precisa ser maior que zero.")
  .max(100_000, "Preço acima do esperado.")
  .nullable()
  // Centavos: o banco e a comparação do motor usam duas casas.
  .transform((n) => (n === null ? null : Math.round(n * 100) / 100));

export const schemaConfigPix = z.object({
  chave: texto140,
  cnpj: texto140,
  precos: z.object({ 1: preco, 2: preco, 4: preco }),
});

export async function gravarConfigPix(
  c: PoolClient,
  adminId: string,
  nova: ConfigPix,
): Promise<ConfigPix> {
  const antes = await lerConfigPix(c);
  const { rowCount } = await c.query(
    "update wakeclub.configuracoes set valor = $1::jsonb where chave = 'venda_pix'",
    [JSON.stringify(nova)],
  );
  if (rowCount !== 1) throw new Error("Configuração da venda Pix não encontrada.");
  await c.query(
    `insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo,
        metadados, entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
     values (null, 'humano', 'config_changed', 'painel', 'venda direta por Pix', null,
             $1::jsonb, $2::jsonb, jsonb_build_object('usuario_id', $3::uuid),
             'config', $4::uuid, 'painel', $3::text, 'painel:venda-pix:' || $5::text)`,
    [JSON.stringify(antes), JSON.stringify(nova), adminId, CONFIG_ID, crypto.randomUUID()],
  );
  return lerConfigPix(c);
}

type Linha = {
  status: string;
  lead_id: string;
  valor: string | null;
  pago_em: Date | null;
  horas_sugeridas: number | null;
  e2e: string | null;
  motivo: string | null;
  venda_id: string | null;
  venda_suspeita_id: string | null;
  evolution_msg_id: string | null;
  enviada_em: Date | null;
};

async function travar(c: PoolClient, id: string): Promise<Linha> {
  const { rows } = await c.query<Linha>(
    `select c.status, c.lead_id, c.valor, c.pago_em, c.horas_sugeridas, c.e2e, c.motivo,
            c.venda_id, c.venda_suspeita_id, m.evolution_msg_id, m.enviada_em
       from wakeclub.comprovantes c
       left join wakeclub.mensagens m on m.id = c.mensagem_id
      where c.id = $1::uuid
      for update of c`,
    [id],
  );
  if (!rows[0]) throw new Error("Comprovante não encontrado.");
  return rows[0];
}

// Pergunta "possível venda repetida": a direta já existe (venda_id) e só se resolve pelas 3 opções.
const ehRepetida = (l: Linha) => l.status === "confirmar" && l.venda_id !== null;

async function evento(
  c: PoolClient,
  e: {
    comprovanteId: string;
    leadId: string;
    tipo: string;
    decisao: string;
    motivo: string | null;
    antes: Record<string, unknown>;
    depois: Record<string, unknown>;
    adminId: string;
  },
) {
  await c.query(
    `insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo,
        metadados, entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
     values ($1::uuid, 'comprovantes', $2::text, 'admin', $3::text, $4::text, $5::jsonb,
             $6::jsonb, jsonb_build_object('admin_id', $7::uuid), 'comprovante', $8::uuid,
             'painel', $7::text, 'painel:comprovante:' || $9::text)`,
    [
      e.leadId,
      e.tipo,
      e.decisao,
      e.motivo,
      JSON.stringify(e.antes),
      JSON.stringify(e.depois),
      e.adminId,
      e.comprovanteId,
      crypto.randomUUID(),
    ],
  );
}

async function fecharComo(
  c: PoolClient,
  id: string,
  adminId: string,
  f: { status: "recusado" | "registrado"; motivo: string | null },
) {
  await c.query(
    `update wakeclub.comprovantes
        set status = $2::text, motivo = coalesce($3::text, motivo), decidido_por = $4::uuid,
            decidido_em = now()
      where id = $1::uuid`,
    [id, f.status, f.motivo, adminId],
  );
}

/**
 * Desfaz uma venda direta: estorno pelo caminho atual e saldo de volta (sem ficar negativo).
 * A etapa não volta sozinha (spec §10b). Devolve as horas tiradas do saldo.
 */
async function desfazerDireta(c: PoolClient, vendaId: string, adminId: string): Promise<number> {
  if (!(await estornar(c, vendaId, adminId)))
    throw new Error("A venda já estava estornada ou não existe.");
  const { rows } = await c.query<{ lead_id: string; saldo: number | null; horas: number | null }>(
    `select l.id as lead_id, l.saldo_horas as saldo, v.horas
       from wakeclub.vendas v join wakeclub.leads l on l.id = v.lead_id
      where v.id = $1::uuid
      for update of l`,
    [vendaId],
  );
  const r = rows[0];
  if (!r || r.saldo === null || r.horas === null) return 0;
  const novo = Math.max(0, r.saldo - r.horas);
  await c.query("update wakeclub.leads set saldo_horas = $2::int where id = $1::uuid", [
    r.lead_id,
    novo,
  ]);
  return Math.max(0, r.saldo - novo);
}

export const schemaConfirmar = z.object({
  id: z.string().uuid(),
  valor: z.number().min(0.01, "O valor precisa ser maior que zero.").max(100_000).optional(),
  horas: z.number().int("Horas inteiras.").min(1).max(100).optional(),
  pagoEm: z.string().datetime({ offset: true }).optional(),
  leadId: z.string().uuid().optional(),
});

/** Confirma a pergunta (como está ou corrigida) e registra a venda Pix; devolve o id da venda. */
export async function aplicarConfirmacao(
  c: PoolClient,
  adminId: string,
  d: z.infer<typeof schemaConfirmar>,
): Promise<string> {
  const l = await travar(c, d.id);
  if (ehRepetida(l)) throw new Error("Escolha qual venda desfazer.");
  if (l.status !== "confirmar") throw new Error("Este comprovante já foi respondido.");
  const valor = d.valor ?? numOuNull(l.valor);
  const horas = d.horas ?? l.horas_sugeridas;
  const pagoEm = d.pagoEm ? new Date(d.pagoEm) : (l.pago_em ?? l.enviada_em);
  if (valor === null || horas === null || !pagoEm)
    throw new Error("Informe valor, horas e data em Corrigir e confirmar.");
  const leadId = d.leadId ?? l.lead_id;
  if (leadId !== l.lead_id) {
    const { rowCount } = await c.query(
      "update wakeclub.comprovantes set lead_id = $2::uuid where id = $1::uuid and exists (select 1 from wakeclub.leads where id = $2::uuid)",
      [d.id, leadId],
    );
    if (rowCount !== 1) throw new Error("Lead não encontrado.");
  }
  try {
    return await registrarVendaPix(c, {
      comprovanteId: d.id,
      leadId,
      valor: Math.round(valor * 100) / 100,
      horas,
      pagoEm,
      e2e: l.e2e,
      evolutionMsgId: l.evolution_msg_id,
      por: { adminId },
    });
  } catch (erro) {
    if ((erro as { code?: unknown }).code === "23505")
      throw new Error("Já existe uma venda com este comprovante.");
    throw erro;
  }
}

export const schemaRecusar = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(1, "Diga o motivo.").max(300, "Até 300 caracteres."),
});

/** "Não é venda": pergunta vira `recusado`; venda já registrada é estornada e as horas voltam. */
export async function aplicarRecusa(
  c: PoolClient,
  adminId: string,
  d: z.infer<typeof schemaRecusar>,
): Promise<void> {
  const l = await travar(c, d.id);
  if (ehRepetida(l)) throw new Error("Escolha qual venda desfazer.");
  let horasDevolvidas = 0;
  if (l.status === "registrado" && l.venda_id) {
    horasDevolvidas = await desfazerDireta(c, l.venda_id, adminId);
  } else if (l.status !== "confirmar") {
    throw new Error("Este comprovante já foi respondido.");
  }
  await fecharComo(c, d.id, adminId, { status: "recusado", motivo: d.motivo });
  await evento(c, {
    comprovanteId: d.id,
    leadId: l.lead_id,
    tipo: "receipt_rejected",
    decisao: l.status === "registrado" ? "venda Pix desfeita pelo admin" : "não é venda",
    motivo: d.motivo,
    antes: { status: l.status },
    depois: { status: "recusado", venda_estornada: l.venda_id, horas_devolvidas: horasDevolvidas },
    adminId,
  });
}

export const schemaRepetida = z.object({
  id: z.string().uuid(),
  desfazer: z.enum(["direta", "app", "nenhuma"]),
});

/**
 * "Possível venda repetida": desfaz a direta (com as horas), a do app (só o estorno; as horas do
 * app seguem a regra de hoje) ou nenhuma. A pergunta fecha nos três casos.
 */
export async function aplicarRepetida(
  c: PoolClient,
  adminId: string,
  d: z.infer<typeof schemaRepetida>,
): Promise<void> {
  const l = await travar(c, d.id);
  if (!ehRepetida(l) || !l.venda_id) throw new Error("Esta pergunta já foi respondida.");
  let horasDevolvidas = 0;
  if (d.desfazer === "direta") {
    horasDevolvidas = await desfazerDireta(c, l.venda_id, adminId);
    // O comprovante que gerou a direta deixa de contar como registrado.
    await c.query(
      `update wakeclub.comprovantes
          set status = 'recusado', motivo = 'venda repetida com venda do app',
              decidido_por = $2::uuid, decidido_em = now()
        where venda_id = $1::uuid and status = 'registrado'`,
      [l.venda_id, adminId],
    );
  } else if (d.desfazer === "app") {
    if (!l.venda_suspeita_id || !(await estornar(c, l.venda_suspeita_id, adminId)))
      throw new Error("A venda do app já estava estornada ou não existe.");
  }
  const status = d.desfazer === "direta" ? "recusado" : "registrado";
  await fecharComo(c, d.id, adminId, { status, motivo: null });
  await evento(c, {
    comprovanteId: d.id,
    leadId: l.lead_id,
    tipo: "repeat_resolved",
    decisao:
      d.desfazer === "nenhuma" ? "as duas vendas ficam" : `venda ${d.desfazer} desfeita pelo admin`,
    motivo: l.motivo,
    antes: { status: l.status },
    depois: {
      status,
      desfazer: d.desfazer,
      horas_devolvidas: horasDevolvidas,
    },
    adminId,
  });
}

export const getConfigPix = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConfigPix> => {
    await exigirAdmin();
    return lerConfigPix(getPoolMotor());
  },
);

export const definirConfigPix = createServerFn({ method: "POST" })
  .validator(schemaConfigPix)
  .handler(async ({ data }): Promise<ConfigPix> => {
    const admin = await exigirAdmin();
    return comTransacao((c) => gravarConfigPix(c, admin.usuarioId, data));
  });

export const getParaConfirmar = createServerFn({ method: "GET" }).handler(
  async (): Promise<ParaConfirmar> => {
    await exigirAdmin();
    return lerParaConfirmar(getPoolMotor());
  },
);

export const confirmarComprovante = createServerFn({ method: "POST" })
  .validator(schemaConfirmar)
  .handler(async ({ data }): Promise<{ vendaId: string }> => {
    const admin = await exigirAdmin();
    const vendaId = await comTransacao((c) => aplicarConfirmacao(c, admin.usuarioId, data));
    return { vendaId };
  });

export const recusarComprovante = createServerFn({ method: "POST" })
  .validator(schemaRecusar)
  .handler(async ({ data }): Promise<{ recusado: true }> => {
    const admin = await exigirAdmin();
    await comTransacao((c) => aplicarRecusa(c, admin.usuarioId, data));
    return { recusado: true };
  });

export const resolverRepetida = createServerFn({ method: "POST" })
  .validator(schemaRepetida)
  .handler(async ({ data }): Promise<{ resolvida: true }> => {
    const admin = await exigirAdmin();
    await comTransacao((c) => aplicarRepetida(c, admin.usuarioId, data));
    return { resolvida: true };
  });
