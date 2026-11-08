import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor } from "./db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarVendaPix } from "./motor/comprovantes";
import {
  aplicarConfirmacao,
  aplicarRecusa,
  aplicarRepetida,
  gravarConfigPix,
  lerParaConfirmar,
  schemaConfigPix,
  schemaConfirmar,
} from "./vendas-pix";

const db = () => getPoolMotor();
const CONFIG_VAZIA = { chave: null, cnpj: null, precos: { 1: null, 2: null, 4: null } };

/** Lead com dono (10%) e saldo 1, pelo pool do motor. */
async function criarLead() {
  const vendedorId = await criarVendedor("Vendedor Pix Admin");
  await db().query("update wakeclub.usuarios set comissao_pct = 10 where id = $1::uuid", [
    vendedorId,
  ]);
  const { rows } = await db().query<{ id: string }>(
    `insert into wakeclub.leads (telefone, nome, atendente_id, saldo_horas)
     values ($1::text, 'Lead Pix Admin', $2::uuid, 1) returning id`,
    [telefoneUnico(), vendedorId],
  );
  return { leadId: rows[0].id, vendedorId };
}

async function pergunta(leadId: string, extra: Record<string, unknown> = {}) {
  const c = {
    valor: 720,
    pago_em: new Date().toISOString(),
    horas_sugeridas: 2,
    motivo: "recebedor não confere com a chave/CNPJ da Wake",
    venda_id: null,
    venda_suspeita_id: null,
    ...extra,
  };
  const { rows } = await db().query<{ id: string }>(
    `insert into wakeclub.comprovantes
       (lead_id, status, valor, pago_em, horas_sugeridas, motivo, venda_id, venda_suspeita_id,
        leitura)
     values ($1::uuid, 'confirmar', $2::numeric, $3::timestamptz, $4::int, $5::text, $6::uuid,
             $7::uuid, '{"valor": 720, "recebedor": "Outra conta"}'::jsonb)
     returning id`,
    [leadId, c.valor, c.pago_em, c.horas_sugeridas, c.motivo, c.venda_id, c.venda_suspeita_id],
  );
  return rows[0].id;
}

const linha = async (id: string) =>
  (await db().query("select * from wakeclub.comprovantes where id = $1::uuid", [id])).rows[0];
const venda = async (id: string) =>
  (await db().query("select * from wakeclub.vendas where id = $1::uuid", [id])).rows[0];
const saldo = async (leadId: string) =>
  (await db().query("select saldo_horas from wakeclub.leads where id = $1::uuid", [leadId])).rows[0]
    .saldo_horas;
const vendasDoLead = async (leadId: string) =>
  (await db().query("select * from wakeclub.vendas where lead_id = $1::uuid", [leadId])).rows;
const eventos = async (id: string) =>
  (
    await db().query(
      `select tipo_evento, gatilho from wakeclub.eventos_automacao
        where entidade_tipo = 'comprovante' and entidade_id = $1::uuid order by id`,
      [id],
    )
  ).rows.map((r) => r.tipo_evento);

describe.skipIf(!bancoTesteAtivo)("vendas Pix no admin", () => {
  afterAll(async () => {
    await db().query(
      "update wakeclub.configuracoes set valor = $1::jsonb where chave = 'venda_pix'",
      [JSON.stringify(CONFIG_VAZIA)],
    );
  });

  test("config grava chave, CNPJ e preços com evento config_changed", async () => {
    const adminId = await criarVendedor("Admin Config Pix");
    const nova = schemaConfigPix.parse({
      chave: "  pix@wake.test ",
      cnpj: "",
      precos: { 1: 400, 2: 720.004, 4: null },
    });
    const salva = await comTransacao((c) => gravarConfigPix(c, adminId, nova));
    expect(salva).toEqual({
      chave: "pix@wake.test",
      cnpj: null,
      precos: { 1: 400, 2: 720, 4: null },
    });
    const { rows } = await db().query(
      `select estado_novo from wakeclub.eventos_automacao
        where tipo_evento = 'config_changed' and origem_id = $1::text`,
      [adminId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].estado_novo.chave).toBe("pix@wake.test");
    expect(() => schemaConfigPix.parse({ ...nova, chave: "x".repeat(141) })).toThrow();
    expect(() => schemaConfigPix.parse({ ...nova, precos: { 1: 0, 2: null, 4: null } })).toThrow();
  });

  test("confirmar registra a venda Pix pelo admin e tira da lista", async () => {
    const adminId = await criarVendedor("Admin Pix");
    const l = await criarLead();
    const id = await pergunta(l.leadId);
    const antes = await lerParaConfirmar(db());
    const p = antes.perguntas.find((x) => x.id === id);
    expect(p).toMatchObject({
      leadNome: "Lead Pix Admin",
      donoNome: "Vendedor Pix Admin",
      valor: 720,
      horasSugeridas: 2,
      mensagemId: null,
      venda: null,
    });
    expect(p?.leitura?.recebedor).toBe("Outra conta");

    const vendaId = await comTransacao((c) => aplicarConfirmacao(c, adminId, { id }));
    const v = await venda(vendaId);
    expect([v.origem_externa, v.status, Number(v.valor), v.horas, v.vinculada_por]).toEqual([
      "pix",
      "paga",
      720,
      2,
      "admin",
    ]);
    expect(v.vendedor_id).toBe(l.vendedorId);
    expect(await saldo(l.leadId)).toBe(3);
    const c = await linha(id);
    expect([c.status, c.venda_id, c.decidido_por]).toEqual(["registrado", vendaId, adminId]);
    expect((await lerParaConfirmar(db())).perguntas.some((x) => x.id === id)).toBe(false);
    // Já respondido: não vira segunda venda.
    await expect(comTransacao((x) => aplicarConfirmacao(x, adminId, { id }))).rejects.toThrow();
  });

  test("corrigir e confirmar grava as horas e o valor corrigidos", async () => {
    const adminId = await criarVendedor("Admin Pix");
    const l = await criarLead();
    const id = await pergunta(l.leadId, { horas_sugeridas: null });
    const vendaId = await comTransacao((c) =>
      aplicarConfirmacao(c, adminId, { id, horas: 3, valor: 999.5 }),
    );
    const v = await venda(vendaId);
    expect([v.horas, Number(v.valor)]).toEqual([3, 999.5]);
    expect(await saldo(l.leadId)).toBe(4);
    expect(() => schemaConfirmar.parse({ id, horas: 101 })).toThrow();
    expect(() => schemaConfirmar.parse({ id, horas: 1.5 })).toThrow();
    expect(() => schemaConfirmar.parse({ id, valor: 0 })).toThrow();
  });

  test("sem horas sugeridas, confirmar como está pede correção", async () => {
    const adminId = await criarVendedor("Admin Pix");
    const l = await criarLead();
    const id = await pergunta(l.leadId, { horas_sugeridas: null });
    await expect(comTransacao((c) => aplicarConfirmacao(c, adminId, { id }))).rejects.toThrow(
      /Corrigir e confirmar/,
    );
    expect((await linha(id)).status).toBe("confirmar");
  });

  test("recusar pergunta não cria venda", async () => {
    const adminId = await criarVendedor("Admin Pix");
    const l = await criarLead();
    const id = await pergunta(l.leadId);
    await comTransacao((c) => aplicarRecusa(c, adminId, { id, motivo: "print de outra loja" }));
    const c = await linha(id);
    expect([c.status, c.motivo, c.venda_id]).toEqual(["recusado", "print de outra loja", null]);
    expect(await vendasDoLead(l.leadId)).toHaveLength(0);
    expect(await eventos(id)).toEqual(["receipt_rejected"]);
  });

  test("recusar venda registrada estorna e devolve horas sem ficar negativo", async () => {
    const adminId = await criarVendedor("Admin Pix");
    const l = await criarLead();
    const id = await pergunta(l.leadId);
    // Registrado pelo motor (aparece em "Registradas automaticamente").
    const vendaId = await comTransacao((c) =>
      registrarVendaPix(c, {
        comprovanteId: id,
        leadId: l.leadId,
        valor: 720,
        horas: 2,
        pagoEm: new Date(),
        e2e: null,
        evolutionMsgId: randomUUID(),
        por: "comprovante",
      }),
    );
    const lista = await lerParaConfirmar(db());
    expect(lista.registradasRecentes.find((r) => r.id === id)).toMatchObject({
      valor: 720,
      horas: 2,
    });
    // Aula gasta: saldo 1, venda de 2 h desfeita deixa 0.
    await db().query("update wakeclub.leads set saldo_horas = 1 where id = $1::uuid", [l.leadId]);
    await comTransacao((c) => aplicarRecusa(c, adminId, { id, motivo: "pagou outra coisa" }));
    expect((await venda(vendaId)).status).toBe("estornada");
    expect(await saldo(l.leadId)).toBe(0);
    expect((await linha(id)).status).toBe("recusado");
    expect(await eventos(id)).toEqual(["sale_registered", "receipt_rejected"]);
    expect((await lerParaConfirmar(db())).registradasRecentes.some((r) => r.id === id)).toBe(false);
  });

  async function repetida() {
    const adminId = await criarVendedor("Admin Pix");
    const l = await criarLead();
    const origem = await pergunta(l.leadId);
    const direta = await comTransacao((c) => aplicarConfirmacao(c, adminId, { id: origem }));
    const { rows } = await db().query<{ id: string }>(
      `insert into wakeclub.vendas
         (origem_externa, id_externo, comprada_em, valor, status, lead_id, horas)
       values ('webhook', $1::text, now(), 720, 'paga', $2::uuid, 2) returning id`,
      [randomUUID(), l.leadId],
    );
    const app = rows[0].id;
    const id = await pergunta(l.leadId, {
      motivo: "possível venda repetida",
      venda_id: direta,
      venda_suspeita_id: app,
    });
    return { adminId, l, origem, direta, app, id };
  }

  test("repetida aparece com as duas vendas e não aceita confirmar nem recusar", async () => {
    const r = await repetida();
    const p = (await lerParaConfirmar(db())).perguntas.find((x) => x.id === r.id);
    expect(p?.venda).toMatchObject({ id: r.direta, origem: "direta", valor: 720, status: "paga" });
    expect(p?.vendaSuspeita).toMatchObject({ id: r.app, origem: "app" });
    await expect(
      comTransacao((c) => aplicarConfirmacao(c, r.adminId, { id: r.id })),
    ).rejects.toThrow();
    await expect(
      comTransacao((c) => aplicarRecusa(c, r.adminId, { id: r.id, motivo: "x" })),
    ).rejects.toThrow();
  });

  test("resolverRepetida 'app' estorna só a do app", async () => {
    const r = await repetida();
    const saldoAntes = await saldo(r.l.leadId);
    await comTransacao((c) => aplicarRepetida(c, r.adminId, { id: r.id, desfazer: "app" }));
    expect((await venda(r.app)).status).toBe("estornada");
    expect((await venda(r.direta)).status).toBe("paga");
    expect(await saldo(r.l.leadId)).toBe(saldoAntes);
    expect((await linha(r.id)).status).toBe("registrado");
    expect(await eventos(r.id)).toEqual(["repeat_resolved"]);
    expect((await lerParaConfirmar(db())).perguntas.some((x) => x.id === r.id)).toBe(false);
  });

  test("resolverRepetida 'direta' estorna a direta e devolve as horas", async () => {
    const r = await repetida();
    expect(await saldo(r.l.leadId)).toBe(3);
    await comTransacao((c) => aplicarRepetida(c, r.adminId, { id: r.id, desfazer: "direta" }));
    expect((await venda(r.direta)).status).toBe("estornada");
    expect((await venda(r.app)).status).toBe("paga");
    expect(await saldo(r.l.leadId)).toBe(1);
    expect([(await linha(r.id)).status, (await linha(r.origem)).status]).toEqual([
      "recusado",
      "recusado",
    ]);
  });

  test("resolverRepetida 'nenhuma' mantém as duas e fecha a pergunta", async () => {
    const r = await repetida();
    await comTransacao((c) => aplicarRepetida(c, r.adminId, { id: r.id, desfazer: "nenhuma" }));
    expect([(await venda(r.direta)).status, (await venda(r.app)).status]).toEqual(["paga", "paga"]);
    expect((await linha(r.id)).status).toBe("registrado");
    // Resolvida não se resolve de novo.
    await expect(
      comTransacao((c) => aplicarRepetida(c, r.adminId, { id: r.id, desfazer: "app" })),
    ).rejects.toThrow();
  });
});
