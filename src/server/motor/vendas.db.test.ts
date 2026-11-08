import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor } from "../db";
import type { VendaNormalizada } from "../vendas/normalizar";
import { lerVendas, lerVendasSemDono } from "../vendas";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import { ErroPermanente } from "./fila";
import { registrarMensagem } from "./ingestao";
import { criarProcessadorVendas, estornar, processarVenda, vincular } from "./vendas";

const db = () => getPoolMotor();
const HORA = 3600_000;

function venda(extra: Partial<VendaNormalizada> = {}): VendaNormalizada {
  return {
    idExterno: `t-${randomUUID()}`,
    compradaEm: new Date().toISOString(),
    valor: 360,
    cpf: null,
    telefone: null,
    produto: "Aula 1h",
    horas: 1,
    status: "paga",
    decisoes: [],
    ...extra,
  };
}

/** O papel só muda pelo dono do banco (nenhuma role da aplicação tem UPDATE nele). */
function tornarAdmin(id: string) {
  const r = spawnSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `import pg from "pg";
       const c = new pg.Client(process.env.ADMIN_DATABASE_URL);
       await c.connect();
       await c.query("update wakeclub.usuarios set papel = 'admin' where id = $1::uuid", [process.argv[1]]);
       await c.end();`,
      id,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
}

const processar = (v: VendaNormalizada) =>
  comTransacao((c) => processarVenda(c, v, { bruto: true }));

/** Lead com dono (comissão em %) e, se pedido, mensagem da equipe em `equipeEm`. */
async function criarLead(o: { pct?: number; equipeEm?: Date } = {}) {
  const telefone = telefoneUnico();
  const r = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone,
      nome: "Lead Venda",
      daEquipe: o.equipeEm !== undefined,
      texto: "oi",
      tipoMidia: "texto",
      enviadaEm: (o.equipeEm ?? new Date(Date.now() - 30 * 24 * HORA)).toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  const vendedorId = await criarVendedor("Vendedor Venda");
  await db().query("update wakeclub.usuarios set comissao_pct = $2::numeric where id = $1::uuid", [
    vendedorId,
    o.pct ?? 10,
  ]);
  await db().query("update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid", [
    r.leadId,
    vendedorId,
  ]);
  return { leadId: r.leadId, mensagemId: r.mensagemId, telefone, vendedorId };
}

async function lerVenda(id: string) {
  const { rows } = await db().query("select * from wakeclub.vendas where id = $1::uuid", [id]);
  return rows[0];
}

async function eventos(vendaId: string) {
  const { rows } = await db().query(
    `select tipo_evento, lead_id, metadados from wakeclub.eventos_automacao
      where entidade_tipo = 'venda' and entidade_id = $1::uuid order by id`,
    [vendaId],
  );
  return rows as {
    tipo_evento: string;
    lead_id: string | null;
    metadados: Record<string, unknown>;
  }[];
}

describe.skipIf(!bancoTesteAtivo)("processador de vendas", () => {
  test("idempotente", async () => {
    const l = await criarLead();
    const v = venda({ telefone: l.telefone });
    const a = await processar(v);
    const b = await processar(v);
    expect(a.nova).toBe(true);
    expect(b).toEqual({ vendaId: a.vendaId, nova: false });
    const { rows } = await db().query(
      "select count(*)::int as n from wakeclub.vendas where id_externo = $1::text",
      [v.idExterno],
    );
    expect(rows[0].n).toBe(1);
    expect((await eventos(a.vendaId)).map((e) => e.tipo_evento)).toEqual([
      "sale_received",
      "sale_linked",
    ]);
  });

  test("cruza por cpf", async () => {
    const l = await criarLead();
    const cpf = String(Math.floor(Math.random() * 1e11)).padStart(11, "0");
    await db().query("update wakeclub.leads set cpf = $2::text where id = $1::uuid", [
      l.leadId,
      cpf,
    ]);
    const { vendaId } = await processar(venda({ cpf, telefone: telefoneUnico() }));
    const lida = await lerVenda(vendaId);
    expect(lida.lead_id).toBe(l.leadId);
    expect(lida.vinculada_por).toBe("cpf");
    const ev = await eventos(vendaId);
    expect(ev.find((e) => e.tipo_evento === "sale_linked")?.lead_id).toBe(l.leadId);
  });

  test("telefone normalizado", async () => {
    const l = await criarLead();
    const idExterno = `t-${randomUUID()}`;
    // Telefone como sistema de venda manda: sem +55, com máscara.
    const local = l.telefone.slice(3);
    const corpo = {
      id: idExterno,
      amount: "360,00",
      phone: `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`,
    };
    const processador = criarProcessadorVendas();
    await comTransacao((c) => processador(c, { id: 1, origem: "vendas", corpo, tentativas: 0 }));
    const { rows } = await db().query(
      "select lead_id, vinculada_por, corpo_bruto from wakeclub.vendas where id_externo = $1::text",
      [idExterno],
    );
    expect(rows[0].lead_id).toBe(l.leadId);
    expect(rows[0].vinculada_por).toBe("telefone");
    expect(rows[0].corpo_bruto).toEqual(corpo);

    const ign = await comTransacao((c) =>
      processador(c, {
        id: 3,
        origem: "vendas",
        corpo: { event: "USER_LOGIN", timestamp: "x", data: { user_id: "1" } },
        tentativas: 0,
      }),
    );
    expect(ign).toBe("ignorado");

    const erro = await comTransacao((c) =>
      processador(c, { id: 2, origem: "vendas", corpo: { amount: 10 }, tentativas: 0 }),
    ).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(ErroPermanente);
    expect((erro as Error).message).toBe("formato desconhecido: sem id da venda");
  });

  test("grava cpf no lead ao casar por telefone", async () => {
    const l = await criarLead();
    const cpf = String(Math.floor(Math.random() * 1e11)).padStart(11, "0");
    await processar(venda({ cpf, telefone: l.telefone }));
    const { rows } = await db().query("select cpf from wakeclub.leads where id = $1::uuid", [
      l.leadId,
    ]);
    expect(rows[0].cpf).toBe(cpf);
  });

  test("sem casamento fica sem dono", async () => {
    const { vendaId, nova } = await processar(venda({ telefone: telefoneUnico() }));
    expect(nova).toBe(true);
    const lida = await lerVenda(vendaId);
    expect(lida.lead_id).toBeNull();
    expect(lida.categoria).toBeNull();
    expect(lida.vendedor_id).toBeNull();
    const ev = await eventos(vendaId);
    expect(ev.map((e) => e.tipo_evento)).toEqual(["sale_received"]);
    expect(ev[0].lead_id).toBeNull();
    expect((await lerVendasSemDono(db())).some((r) => r.id === vendaId)).toBe(true);
  });

  test("vinculo manual categoriza e comissiona", async () => {
    const compra = new Date();
    const l = await criarLead({ pct: 10, equipeEm: new Date(compra.getTime() - HORA) });
    const cpf = String(Math.floor(Math.random() * 1e11)).padStart(11, "0");
    const v = venda({ compradaEm: compra.toISOString(), telefone: telefoneUnico(), cpf });
    const { vendaId } = await processar(v);
    const adminId = randomUUID();
    await comTransacao((c) => vincular(c, vendaId, l.leadId, adminId));

    const lida = await lerVenda(vendaId);
    expect(lida.lead_id).toBe(l.leadId);
    expect(lida.vinculada_por).toBe("admin");
    expect(lida.categoria).toBe("atendimento");
    expect(lida.categoria_motivo).toBe(l.mensagemId);
    expect(lida.vendedor_id).toBe(l.vendedorId);
    expect(Number(lida.comissao_pct)).toBe(10);
    expect(Number(lida.comissao_valor)).toBe(36);
    const lead = await db().query("select cpf from wakeclub.leads where id = $1::uuid", [l.leadId]);
    expect(lead.rows[0].cpf).toBe(cpf);
    const linked = (await eventos(vendaId)).find((e) => e.tipo_evento === "sale_linked");
    expect(linked?.metadados.admin_id).toBe(adminId);

    // % congelado: mudar o do vendedor e reprocessar não recalcula.
    await db().query("update wakeclub.usuarios set comissao_pct = 50 where id = $1::uuid", [
      l.vendedorId,
    ]);
    expect((await processar(v)).nova).toBe(false);
    expect(Number((await lerVenda(vendaId)).comissao_valor)).toBe(36);
    // Já tem dono: segundo vínculo falha.
    const erro = await comTransacao((c) => vincular(c, vendaId, l.leadId, adminId)).catch(
      (e: Error) => e.message,
    );
    expect(erro).toBe("Venda já tem dono ou não existe.");
    // Lista do período (dia em São Paulo) filtrada pelo vendedor.
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(compra);
    const lista = await lerVendas(db(), { de: hoje, ate: hoje, vendedorId: l.vendedorId });
    expect(lista.map((r) => [r.id, r.categoria, r.comissaoValor])).toEqual([
      [vendaId, "atendimento", 36],
    ]);
  });

  test("PAID do app sem casamento credita pelo user_id; vínculo do admin depois não credita de novo", async () => {
    const b = await criarLead();
    const userId = randomUUID();
    await db().query("update wakeclub.leads set app_user_id = $2::text where id = $1::uuid", [
      b.leadId,
      userId,
    ]);
    const tx = randomUUID();
    const processador = criarProcessadorVendas();
    await comTransacao((c) =>
      processador(c, {
        id: 1,
        origem: "vendas",
        corpo: {
          event: "USER_HOUR_PURCHASE_PAID",
          timestamp: new Date().toISOString(),
          data: {
            transaction_id: tx,
            price_paid: 360,
            phone: telefoneUnico(),
            user_id: userId,
            hours: 4,
          },
        },
        tentativas: 0,
      }),
    );
    const { rows } = await db().query(
      "select id, lead_id from wakeclub.vendas where id_externo = $1::text",
      [tx],
    );
    expect(rows[0].lead_id).toBeNull();
    const saldo = async () =>
      (await db().query("select saldo_horas from wakeclub.leads where id = $1::uuid", [b.leadId]))
        .rows[0].saldo_horas;
    expect(await saldo()).toBe(4);
    await comTransacao((c) => vincular(c, rows[0].id, b.leadId, randomUUID()));
    expect((await lerVenda(rows[0].id)).lead_id).toBe(b.leadId);
    expect(await saldo()).toBe(4);
  });

  test("categoria follow-up quando followup enviado nas 48h", async () => {
    const compra = new Date();
    const l = await criarLead({ pct: 5, equipeEm: new Date(compra.getTime() - 3 * HORA) });
    const { rows } = await db().query(
      `insert into wakeclub.followups (lead_id, agendado_para, tipo, status, enviado_em)
       values ($1::uuid, now() - interval '2 hours', 'reengajar', 'enviado', $2::timestamptz)
       returning id`,
      [l.leadId, new Date(compra.getTime() - 2 * HORA).toISOString()],
    );
    const { vendaId } = await processar(
      venda({ compradaEm: compra.toISOString(), telefone: l.telefone, valor: 200 }),
    );
    const lida = await lerVenda(vendaId);
    expect(lida.categoria).toBe("follow-up");
    expect(lida.categoria_motivo).toBe(rows[0].id);
    expect(Number(lida.comissao_valor)).toBe(10);

    // Cinco dias depois, sem interação nas 48h: recompra, sem comissão.
    const depois = new Date(compra.getTime() + 5 * 24 * HORA).toISOString();
    const r = await processar(venda({ compradaEm: depois, telefone: l.telefone }));
    const recompra = await lerVenda(r.vendaId);
    expect(recompra.categoria).toBe("recompra");
    expect(Number(recompra.comissao_valor)).toBe(0);
  });

  test("estorno via webhook", async () => {
    const l = await criarLead();
    const v = venda({ telefone: l.telefone });
    const { vendaId } = await processar(v);
    await processar({ ...v, status: "estornada" });
    await processar({ ...v, status: "estornada" });
    const lida = await lerVenda(vendaId);
    expect(lida.status).toBe("estornada");
    expect(lida.estornada_em).not.toBeNull();
    const refund = (await eventos(vendaId)).filter((e) => e.tipo_evento === "sale_refunded");
    expect(refund.length).toBe(1);
    expect(refund[0].metadados.pos_fechamento).toBe(false);

    // Venda já num fechamento: estorno manual só marca o evento como pós-fechamento.
    const outra = await processar(venda({ telefone: l.telefone }));
    const f = await db().query(
      "insert into wakeclub.fechamentos (vendedor_id, mes) values ($1::uuid, '2026-01-01') returning id",
      [l.vendedorId],
    );
    await db().query("update wakeclub.vendas set fechamento_id = $2::uuid where id = $1::uuid", [
      outra.vendaId,
      f.rows[0].id,
    ]);
    const adminId = randomUUID();
    expect(await comTransacao((c) => estornar(c, outra.vendaId, adminId))).toBe(true);
    expect(await comTransacao((c) => estornar(c, outra.vendaId, adminId))).toBe(false);
    const ev = (await eventos(outra.vendaId)).find((e) => e.tipo_evento === "sale_refunded");
    expect(ev?.metadados).toMatchObject({ pos_fechamento: true, admin_id: adminId });
  });

  test("venda do app parecida com venda Pix das 48 h anteriores abre uma pergunta", async () => {
    const adminId = await criarVendedor("Admin Venda");
    tornarAdmin(adminId);
    const l = await criarLead();
    const { rows: pix } = await db().query<{ id: string }>(
      `insert into wakeclub.vendas
         (origem_externa, id_externo, comprada_em, valor, lead_id, horas, status)
       values ('pix', $1::text, now() - interval '1 day', 720, $2::uuid, 2, 'paga') returning id`,
      [`pix-${randomUUID()}`, l.leadId],
    );
    const perguntas = async () =>
      (
        await db().query(
          `select c.id, c.mensagem_id, c.status, c.motivo, c.valor, c.venda_id,
                  c.venda_suspeita_id,
                  (select count(*)::int from wakeclub.eventos_automacao e
                    where e.entidade_tipo = 'comprovante' and e.entidade_id = c.id) as eventos
             from wakeclub.comprovantes c where c.lead_id = $1::uuid`,
          [l.leadId],
        )
      ).rows;

    // Valor diferente: nenhuma pergunta.
    await processar(venda({ telefone: l.telefone, valor: 360 }));
    expect(await perguntas()).toEqual([]);

    const app = venda({ telefone: l.telefone, valor: 720, horas: 2 });
    const { vendaId } = await processar(app);
    await processar(app); // mesmo id de novo: nada novo
    const lida = await lerVenda(vendaId);
    expect([lida.lead_id, lida.status]).toEqual([l.leadId, "paga"]);
    expect((await lerVenda(pix[0].id)).status).toBe("paga");
    const p = await perguntas();
    expect(p).toEqual([
      {
        id: p[0]?.id,
        mensagem_id: null,
        status: "confirmar",
        motivo: "possível venda repetida",
        valor: "720.00",
        venda_id: pix[0].id,
        venda_suspeita_id: vendaId,
        eventos: 1,
      },
    ]);
    const { rows: avisos } = await db().query(
      `select titulo, corpo from wakeclub.notificacoes
        where usuario_id = $1::uuid and tipo = 'comprovante'`,
      [adminId],
    );
    expect(avisos).toEqual([
      {
        titulo: "Comprovante para confirmar",
        corpo: expect.stringMatching(/^Lead Venda · R\$\s720,00$/),
      },
    ]);
  });
});
