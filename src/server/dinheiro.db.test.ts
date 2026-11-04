import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import type { Sessao } from "./auth";
import { comTransacao, getPoolMotor } from "./db";
import {
  lerPainelVendedor,
  lerRankingSemanal,
  lerResumoDinheiro,
  vendedorPermitido,
} from "./dinheiro";
import { fecharMes } from "./fechamento";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";
import { processarVenda } from "./motor/vendas";
import type { VendaNormalizada } from "./vendas/normalizar";

const db = () => getPoolMotor();
const HORA = 3600_000;

async function vendedor(nome: string, pct = 10): Promise<string> {
  const id = await criarVendedor(nome);
  await db().query("update wakeclub.usuarios set comissao_pct = $2::numeric where id = $1::uuid", [
    id,
    pct,
  ]);
  return id;
}

/** Lead do vendedor com a primeira mensagem em `quando` (da equipe ou do lead). */
async function lead(vendedorId: string, quando: Date, daEquipe: boolean) {
  const telefone = telefoneUnico();
  const r = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone,
      nome: "Lead Dinheiro",
      daEquipe,
      texto: "oi",
      tipoMidia: "texto",
      enviadaEm: quando.toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  await db().query("update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid", [
    r.leadId,
    vendedorId,
  ]);
  return { leadId: r.leadId, telefone };
}

/** Venda paga (ou estornada) do vendedor; `comissiona` põe a equipe 1h antes (atendimento). */
async function vender(
  vendedorId: string,
  compradaEm: string,
  valor: number,
  o: { comissiona?: boolean; status?: "paga" | "estornada" } = {},
): Promise<string> {
  const comissiona = o.comissiona ?? true;
  const quando = new Date(Date.parse(compradaEm) - (comissiona ? HORA : 30 * 24 * HORA));
  const l = await lead(vendedorId, quando, comissiona);
  const v: VendaNormalizada = {
    idExterno: `d-${randomUUID()}`,
    compradaEm,
    valor,
    cpf: null,
    telefone: l.telefone,
    produto: "Aula 1h",
    horas: 1,
    status: o.status ?? "paga",
    decisoes: [],
  };
  const { vendaId } = await comTransacao((c) => processarVenda(c, v, { bruto: true }));
  return vendaId;
}

async function precoHora(): Promise<number> {
  const { rows } = await db().query(
    "select valor #>> '{}' as p from wakeclub.configuracoes where chave = 'preco_hora'",
  );
  return Number(rows[0].p);
}

describe.skipIf(!bancoTesteAtivo)("dinheiro", () => {
  test("pode entrar = esperado × %", async () => {
    const vid = await vendedor("Vendedor Pipeline", 10);
    const preco = await precoHora();
    const etapas: [string, string, number | null, boolean][] = [
      ["Aguardando pagamento", "quente", 2, false], // 2 × preço × 70%
      ["Link enviado", "morno", null, false], // 1 × preço × 20%
      ["Negociação encerrada", "quente", 3, false], // fora do pipeline
      ["Atendimento", "quente", 1, true], // opt-out
    ];
    for (const [etiqueta, temperatura, horas, optOut] of etapas) {
      const { leadId } = await lead(vid, new Date(), false);
      await db().query(
        `update wakeclub.leads set etiqueta = $2::text, temperatura = $3::text,
                horas_estimadas = $4::smallint, opt_out = $5::boolean where id = $1::uuid`,
        [leadId, etiqueta, temperatura, horas, optOut],
      );
    }
    const esperado = Math.round((2 * preco * 0.7 + preco * 0.2) * 100) / 100;

    const painel = await lerPainelVendedor(db(), vid);
    expect(painel.podeEntrar).toBe(Math.round(esperado * 10) / 100);
    const resumo = await lerResumoDinheiro(db(), { de: "2024-01-01", ate: "2024-01-31" }, vid);
    expect(resumo).toMatchObject({
      pipelineCheio: 3 * preco,
      pipelineEsperado: esperado,
      leadsAtivos: 2,
    });
  });

  test("garantida no mês", async () => {
    const vid = await vendedor("Vendedor Garantida", 10);
    await vender(vid, "2024-02-01T03:30:00Z", 1000); // 01/02 00h30 em São Paulo
    await vender(vid, "2024-02-10T15:00:00Z", 500, { comissiona: false });
    await vender(vid, "2024-02-11T15:00:00Z", 300, { status: "estornada" });
    await vender(vid, "2024-02-01T02:30:00Z", 200); // 31/01 23h30 em São Paulo
    await vender(vid, "2024-03-01T03:30:00Z", 400); // mês seguinte

    const painel = await lerPainelVendedor(db(), vid, new Date("2024-02-20T15:00:00Z"));
    expect(painel.garantidaNoMes).toBe(100);
  });

  test("a pagar dia 10 = mês anterior não pago", async () => {
    const vid = await vendedor("Vendedor Dia 10", 10);
    const adminId = await criarVendedor("Admin Dinheiro");
    await vender(vid, "2024-04-10T15:00:00Z", 1000);
    await vender(vid, "2024-04-12T15:00:00Z", 500, { comissiona: false });
    await vender(vid, "2024-05-02T15:00:00Z", 700); // mês corrente
    const agora = new Date("2024-05-15T15:00:00Z");
    const periodo = { de: "2024-05-01", ate: "2024-05-31" };

    expect((await lerPainelVendedor(db(), vid, agora)).aPagarDia10).toEqual({
      mes: "2024-04",
      valor: 100,
    });
    expect((await lerResumoDinheiro(db(), periodo, vid, agora)).comissaoAPagarDia10).toEqual({
      mes: "2024-04",
      valor: 100,
    });

    await comTransacao((c) => fecharMes(c, vid, "2024-04", adminId));
    expect((await lerPainelVendedor(db(), vid, agora)).aPagarDia10).toEqual({
      mes: "2024-04",
      valor: 0,
    });
    expect((await lerResumoDinheiro(db(), periodo, vid, agora)).comissaoAPagarDia10.valor).toBe(0);
  });

  test("a pagar dia 10 não desconta saldo negativo de um vendedor do total", async () => {
    // Saldo negativo paga 0 (`fecharMes`); somado ao total, comeria a comissão dos outros.
    const agora = new Date("2018-08-15T15:00:00Z");
    const periodo = { de: "2018-08-01", ate: "2018-08-31" };
    const total = async () =>
      (await lerResumoDinheiro(db(), periodo, null, agora)).comissaoAPagarDia10.valor;
    const antes = await total();

    const negativo = await vendedor("Vendedor Negativo", 10);
    await db().query(
      `insert into wakeclub.lancamentos_comissao (vendedor_id, venda_id, valor, motivo)
       values ($1::uuid, null, -50, 'teste saldo negativo')`,
      [negativo],
    );
    const positivo = await vendedor("Vendedor Positivo", 10);
    await vender(positivo, "2018-07-10T15:00:00Z", 1000);

    expect((await lerPainelVendedor(db(), negativo, agora)).aPagarDia10.valor).toBe(0);
    expect(await total()).toBe(Math.round((antes + 100) * 100) / 100);
  });

  test("ranking semanal segunda a domingo SP", async () => {
    const a = await vendedor("Vendedor A", 10);
    const b = await vendedor("Vendedor B", 10);
    const c = await vendedor("Vendedor C", 10);
    // Semana de segunda 10/06/2019 00h a domingo 16/06/2019 23h59 em São Paulo (UTC-3).
    await vender(a, "2019-06-10T03:00:30Z", 1000); // segunda 00h00 SP: entra
    await vender(a, "2019-06-10T02:59:00Z", 5000); // domingo anterior 23h59 SP: fora
    await vender(b, "2019-06-17T02:59:00Z", 1500); // domingo 23h59 SP: entra
    await vender(b, "2019-06-17T03:01:00Z", 9000); // segunda seguinte: fora
    await vender(b, "2019-06-12T15:00:00Z", 700, { comissiona: false }); // não comissionável
    await vender(c, "2019-06-12T15:00:00Z", 800, { status: "estornada" });

    const ranking = await lerRankingSemanal(db(), a, new Date("2019-06-12T15:00:00Z"));
    const de = (id: string) => ranking.find((r) => r.vendedorId === id) ?? { posicao: NaN };
    expect(de(b)).toMatchObject({ nome: "Vendedor B", valor: 1500, vendas: 1, eu: false });
    expect(de(a)).toMatchObject({ nome: "Vendedor A", valor: 1000, vendas: 1, eu: true });
    expect(de(c)).toMatchObject({ valor: 0, vendas: 0, eu: false });
    expect(de(b).posicao).toBeLessThan(de(a).posicao);
    expect(de(a).posicao).toBeLessThan(de(c).posicao);
    expect(ranking.map((r) => r.posicao)).toEqual(
      [...ranking.map((r) => r.posicao)].sort((x, y) => x - y),
    );
    expect(Object.keys(ranking[0]).sort()).toEqual(
      ["eu", "nome", "posicao", "valor", "vendas", "vendedorId"].sort(),
    );
  });

  test("resumo do período em São Paulo, só vendas pagas", async () => {
    const vid = await vendedor("Vendedor Resumo", 10);
    const entra1 = await vender(vid, "2023-03-01T03:30:00Z", 1000); // 01/03 00h30 SP
    const entra2 = await vender(vid, "2023-04-01T02:30:00Z", 200); // 31/03 23h30 SP
    await vender(vid, "2023-04-01T03:30:00Z", 300); // 01/04 SP: fora
    await vender(vid, "2023-03-01T02:30:00Z", 400); // 28/02 SP: fora
    const entra3 = await vender(vid, "2023-03-15T15:00:00Z", 500, { comissiona: false });
    await vender(vid, "2023-03-16T15:00:00Z", 900, { status: "estornada" });

    const r = await lerResumoDinheiro(db(), { de: "2023-03-01", ate: "2023-03-31" }, vid);
    expect(r.vendidoPeriodo).toEqual({ valor: 1700, quantidade: 3 });
    expect(r.porCategoria).toEqual([
      { categoria: "follow-up", valor: 0, quantidade: 0, percentual: 0 },
      { categoria: "atendimento", valor: 1200, quantidade: 2, percentual: 71 },
      { categoria: "recompra", valor: 0, quantidade: 0, percentual: 0 },
      { categoria: "espontanea", valor: 500, quantidade: 1, percentual: 29 },
    ]);
    expect(r.vendasRecentes.map((v) => v.id)).toEqual([entra2, entra3, entra1]);
    expect(r.rankingPeriodo).toEqual([
      { vendedorId: vid, nome: "Vendedor Resumo", vendas: 3, valor: 1700, percentual: 100 },
    ]);
  });

  test("posse do resumo", () => {
    const sessao = (papel: Sessao["papel"]): Sessao => ({
      usuarioId: randomUUID(),
      nome: "x",
      usuario: "x",
      papel,
      labelId: null,
    });
    const atendente = sessao("atendente");
    const admin = sessao("admin");
    const outro = randomUUID();
    expect(vendedorPermitido(atendente, undefined)).toBe(atendente.usuarioId);
    expect(vendedorPermitido(atendente, atendente.usuarioId)).toBe(atendente.usuarioId);
    expect(() => vendedorPermitido(atendente, outro)).toThrow("não autorizado");
    expect(vendedorPermitido(admin, undefined)).toBeNull();
    expect(vendedorPermitido(admin, outro)).toBe(outro);
  });
});
