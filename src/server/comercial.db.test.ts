import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { lerComercial } from "./comercial";
import { comTransacao, getPoolMotor } from "./db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";
import { processarVenda } from "./motor/vendas";

const db = () => getPoolMotor();
const MIN = 60_000;
const agora = new Date("2026-11-05T15:00:00Z");
const outubro = { de: "2026-10-01", ate: "2026-10-31" };

async function mensagem(telefone: string, quando: Date, daEquipe: boolean) {
  const { leadId } = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone,
      nome: "Lead Comercial",
      daEquipe,
      texto: "oi",
      tipoMidia: "texto",
      enviadaEm: quando.toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  return leadId;
}

/** Lead do vendedor com a primeira mensagem em `quando`; `resposta` em minutos depois. */
async function lead(
  vendedorId: string,
  quando: string,
  o: { daEquipe?: boolean; resposta?: number } = {},
) {
  const telefone = telefoneUnico();
  const em = new Date(quando);
  const leadId = await mensagem(telefone, em, o.daEquipe ?? false);
  if (o.resposta !== undefined) await mensagem(telefone, new Date(+em + o.resposta * MIN), true);
  await db().query("update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid", [
    leadId,
    vendedorId,
  ]);
  return { leadId, telefone };
}

async function origem(
  leadId: string,
  canal: string,
  anuncio: { app?: string; id?: string; titulo?: string } = {},
) {
  await db().query(
    `update wakeclub.leads set origem_canal = $2::text, origem_app = $3::text,
            origem_anuncio_id = $4::text, origem_anuncio_titulo = $5::text
      where id = $1::uuid`,
    [leadId, canal, anuncio.app ?? null, anuncio.id ?? null, anuncio.titulo ?? null],
  );
}

async function vender(telefone: string, compradaEm: string, valor: number) {
  await comTransacao((c) =>
    processarVenda(
      c,
      {
        idExterno: `c-${randomUUID()}`,
        compradaEm,
        valor,
        cpf: null,
        telefone,
        produto: "Aula 1h",
        horas: 1,
        status: "paga",
        decisoes: [],
      },
      { bruto: true },
    ),
  );
}

describe.skipIf(!bancoTesteAtivo)("resumo comercial", () => {
  test("coorte, vendas, existentes, origem e atendimento do período", async () => {
    const vendedor = await criarVendedor("Vendedor Comercial");
    const a = await lead(vendedor, "2026-10-05T15:00:00Z", { resposta: 30 });
    await origem(a.leadId, "anuncio", { app: "instagram", id: "ad1", titulo: "Aula experimental" });
    await vender(a.telefone, "2026-11-02T15:00:00Z", 360);
    const b = await lead(vendedor, "2026-10-20T15:00:00Z");
    await origem(b.leadId, "link");
    const c = await lead(vendedor, "2026-09-15T15:00:00Z", { resposta: 60 });
    await vender(c.telefone, "2026-10-10T15:00:00Z", 500);
    // Review Focus 1 e 2: o lead nunca respondeu, a venda vai para existentes.
    const d = await lead(vendedor, "2026-10-02T15:00:00Z", { daEquipe: true });
    await vender(d.telefone, "2026-10-12T15:00:00Z", 200);
    // Review Focus 3: 31/10 23:30 em São Paulo entra no período; origem não gravada.
    await lead(vendedor, "2026-11-01T02:30:00Z");

    const r = await lerComercial(db(), outubro, vendedor, agora);
    expect(r.periodo).toEqual({
      de: "2026-10-01",
      ate: "2026-10-31",
      dias: 31,
      anterior: { de: "2026-08-31", ate: "2026-09-30" },
    });
    expect(r.leadsNovos).toEqual({ atual: 3, anterior: 1 });
    expect(r.vendas).toEqual({
      quantidade: { atual: 2, anterior: 0 },
      faturamento: { atual: 700, anterior: 0 },
    });
    expect(r.coorte).toEqual({ compraram: 1, conversaoPct: 33, faturamento: 360 });
    expect(r.clientesExistentes).toEqual({ quantidade: 2, faturamento: 700 });
    expect(
      r.porOrigem.map((o) => [
        o.canal,
        o.app,
        o.leadsNovos,
        o.compraram,
        o.conversaoPct,
        o.faturamento,
      ]),
    ).toEqual([
      ["anuncio", "instagram", 1, 1, 100, 360],
      ["link", null, 1, 0, 0, 0],
      ["busca", null, 0, 0, 0, 0],
      ["outro", null, 0, 0, 0, 0],
      ["direto", null, 1, 0, 0, 0],
    ]);
    expect(r.anuncios).toEqual([
      {
        anuncioId: "ad1",
        titulo: "Aula experimental",
        leadsNovos: 1,
        compraram: 1,
        conversaoPct: 100,
        faturamento: 360,
      },
    ]);
    expect(r.atendimento).toEqual({
      medianaPrimeiraRespostaMin: { atual: 30, anterior: 60 },
      semResposta: 2,
    });
    expect(r.meta).toMatchObject({ porDia: 2, periodo: 62, atingidoPct: 3, projecaoMes: null });
  });

  test("venda de outro vendedor para lead da coorte conta na conversão do dono do lead", async () => {
    const v1 = await criarVendedor("Dono do Lead");
    const v2 = await criarVendedor("Quem Vendeu");
    const l = await lead(v2, "2026-10-08T15:00:00Z");
    await vender(l.telefone, "2026-10-09T15:00:00Z", 150);
    await db().query("update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid", [
      l.leadId,
      v1,
    ]);

    const r1 = await lerComercial(db(), outubro, v1, agora);
    expect(r1.coorte).toEqual({ compraram: 1, conversaoPct: 100, faturamento: 150 });
    expect(r1.vendas.quantidade.atual).toBe(0);
    const r2 = await lerComercial(db(), outubro, v2, agora);
    expect(r2.leadsNovos.atual).toBe(0);
    expect(r2.vendas.quantidade.atual).toBe(1);
    expect(r2.clientesExistentes.quantidade).toBe(0);
  });

  test("lead sem mensagem recebida não é novo", async () => {
    const vendedor = await criarVendedor("Vendedor Sem Resposta");
    const d = await lead(vendedor, "2026-10-02T15:00:00Z", { daEquipe: true });
    await vender(d.telefone, "2026-10-12T15:00:00Z", 200);

    const r = await lerComercial(db(), outubro, vendedor, agora);
    expect(r.leadsNovos.atual).toBe(0);
    expect(r.vendas.quantidade.atual).toBe(1);
    expect(r.clientesExistentes).toEqual({ quantidade: 1, faturamento: 200 });
    expect(r.porOrigem.every((o) => o.leadsNovos === 0)).toBe(true);
  });

  test("limite do período em São Paulo", async () => {
    const vendedor = await criarVendedor("Vendedor Limite");
    const l = await lead(vendedor, "2026-11-01T02:30:00Z"); // 31/10 23:30 em SP
    await vender(l.telefone, "2026-11-01T02:40:00Z", 100);
    await lead(vendedor, "2026-11-01T03:00:00Z"); // 01/11 00:00 em SP: fora

    const r = await lerComercial(db(), outubro, vendedor, agora);
    expect(r.leadsNovos.atual).toBe(1);
    expect(r.vendas.quantidade.atual).toBe(1);
    expect(r.coorte.compraram).toBe(1);
    expect(r.clientesExistentes.quantidade).toBe(0);
  });
});
