import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor, getPoolRw } from "./db";
import { calcularFechamento, fecharMes, lerLancamentos } from "./fechamento";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";
import { processarVenda, vincular } from "./motor/vendas";
import type { VendaNormalizada } from "./vendas/normalizar";

const db = () => getPoolMotor();
const HORA = 3600_000;

async function vendedor(pct = 10): Promise<string> {
  const id = await criarVendedor("Vendedor Fechamento");
  await db().query("update wakeclub.usuarios set comissao_pct = $2::numeric where id = $1::uuid", [
    id,
    pct,
  ]);
  return id;
}

/** Lead do vendedor; com `comissiona`, a equipe falou 1h antes da compra (atendimento). */
async function lead(vendedorId: string, compradaEm: string, comissiona: boolean) {
  const telefone = telefoneUnico();
  const quando = new Date(Date.parse(compradaEm) - (comissiona ? HORA : 30 * 24 * HORA));
  const r = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone,
      nome: "Lead Fechamento",
      daEquipe: comissiona,
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

function venda(extra: Partial<VendaNormalizada>): VendaNormalizada {
  return {
    idExterno: `f-${randomUUID()}`,
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

const processar = (v: VendaNormalizada) =>
  comTransacao((c) => processarVenda(c, v, { bruto: true }));

/** Venda do vendedor já cruzada com um lead novo. */
async function vender(
  vendedorId: string,
  compradaEm: string,
  valor: number,
  o: { comissiona?: boolean; status?: "paga" | "estornada" } = {},
) {
  const l = await lead(vendedorId, compradaEm, o.comissiona ?? true);
  const v = venda({ telefone: l.telefone, compradaEm, valor, status: o.status ?? "paga" });
  const { vendaId } = await processar(v);
  return { vendaId, v };
}

const linhaDe = async (mes: string, vendedorId: string) =>
  (await calcularFechamento(db(), mes)).find((l) => l.vendedorId === vendedorId);

const pagar = (vendedorId: string, mes: string, adminId: string) =>
  comTransacao((c) => fecharMes(c, vendedorId, mes, adminId));

async function lancamentos(vendaId: string) {
  const { rows } = await db().query(
    `select valor::float as valor, motivo, fechamento_id from wakeclub.lancamentos_comissao
      where venda_id = $1::uuid order by criado_em`,
    [vendaId],
  );
  return rows as { valor: number; motivo: string; fechamento_id: string | null }[];
}

describe.skipIf(!bancoTesteAtivo)("fechamento mensal", () => {
  test("fechamento soma só comissionáveis pagas do mês", async () => {
    const vid = await vendedor(10);
    await vender(vid, "2025-03-10T15:00:00Z", 360);
    await vender(vid, "2025-04-01T01:00:00Z", 200); // 31/03 22h em São Paulo
    await vender(vid, "2025-03-12T15:00:00Z", 500, { comissiona: false });
    const estornada = await vender(vid, "2025-03-13T15:00:00Z", 1000, { status: "estornada" });
    await vender(vid, "2025-03-01T02:00:00Z", 100); // 28/02 23h em São Paulo
    await vender(vid, "2025-04-15T15:00:00Z", 400);
    await getPoolRw().query("update wakeclub.usuarios set ativo = false where id = $1::uuid", [
      vid,
    ]);
    const semVendas = await vendedor(10);

    expect(await linhaDe("2025-03", vid)).toEqual({
      vendedorId: vid,
      nome: "Vendedor Fechamento",
      totalVendas: 560,
      quantidade: 2,
      totalComissao: 56,
      ajustes: 0,
      aPagar: 56,
      pagoEm: null,
    });
    // Ativo sem vendas aparece zerado; inativo sem vendas no mês não aparece.
    expect(await linhaDe("2025-03", semVendas)).toMatchObject({ quantidade: 0, aPagar: 0 });
    expect(await linhaDe("2025-05", vid)).toBeUndefined();
    // Estorno em mês aberto só tira a venda do cálculo: nenhum lançamento.
    expect(await lancamentos(estornada.vendaId)).toEqual([]);
  });

  test("marcar pago congela", async () => {
    const vid = await vendedor(10);
    const adminId = await criarVendedor("Admin Fechamento");
    const { vendaId } = await vender(vid, "2025-05-10T15:00:00Z", 360);

    const fechamentoId = await pagar(vid, "2025-05", adminId);

    const { rows } = await db().query("select * from wakeclub.fechamentos where id = $1::uuid", [
      fechamentoId,
    ]);
    expect(rows[0]).toMatchObject({ vendedor_id: vid, pago_por: adminId, quantidade_vendas: 1 });
    expect(Number(rows[0].total_vendas)).toBe(360);
    expect(Number(rows[0].total_comissao)).toBe(36);
    expect(Number(rows[0].a_pagar)).toBe(36);
    expect(rows[0].pago_em).not.toBeNull();
    const v = await db().query("select fechamento_id from wakeclub.vendas where id = $1::uuid", [
      vendaId,
    ]);
    expect(v.rows[0].fechamento_id).toBe(fechamentoId);
    const ev = await db().query(
      `select metadados from wakeclub.eventos_automacao
        where tipo_evento = 'commission_paid' and entidade_tipo = 'config'
          and entidade_id = $1::uuid`,
      [fechamentoId],
    );
    expect(ev.rows).toEqual([{ metadados: { vendedor_id: vid, mes: "2025-05" } }]);

    await expect(pagar(vid, "2025-05", adminId)).rejects.toThrow("Mês já pago");
    const mesCorrente = new Date()
      .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
      .slice(0, 7);
    await expect(pagar(vid, mesCorrente, adminId)).rejects.toThrow("Só meses encerrados");
    const linha = await linhaDe("2025-05", vid);
    expect(linha).toMatchObject({ quantidade: 1, totalVendas: 360, totalComissao: 36, aPagar: 36 });
    expect(linha?.pagoEm).not.toBeNull();
  });

  test("estorno pós-pagamento vira lançamento negativo", async () => {
    const vid = await vendedor(10);
    const adminId = await criarVendedor("Admin Fechamento");
    const { vendaId, v } = await vender(vid, "2025-06-10T15:00:00Z", 360);
    await pagar(vid, "2025-06", adminId);

    await processar({ ...v, status: "estornada" });
    await processar({ ...v, status: "estornada" });

    expect(await lancamentos(vendaId)).toEqual([
      { valor: -36, motivo: "estorno de venda do fechamento 2025-06", fechamento_id: null },
    ]);
    // O mês pago não muda; o negativo entra no próximo fechamento.
    expect(await linhaDe("2025-06", vid)).toMatchObject({ quantidade: 1, totalComissao: 36 });
    expect(await linhaDe("2025-07", vid)).toMatchObject({
      quantidade: 0,
      totalComissao: 0,
      ajustes: -36,
      aPagar: -36,
    });
    expect(await lerLancamentos(db(), vid)).toMatchObject([{ vendaId, valor: -36 }]);

    const julho = await pagar(vid, "2025-07", adminId);
    expect((await lancamentos(vendaId))[0].fechamento_id).toBe(julho);
    // Mês pago com saldo negativo: paga 0 e a dívida passa adiante como lançamento pendente.
    expect(await linhaDe("2025-07", vid)).toMatchObject({ ajustes: -36, aPagar: 0 });
    const f = await db().query(
      "select total_comissao::float, ajustes::float, a_pagar::float from wakeclub.fechamentos where id = $1::uuid",
      [julho],
    );
    expect(f.rows[0]).toEqual({ total_comissao: 0, ajustes: -36, a_pagar: 0 });
    const saldo = await db().query(
      `select valor::float as valor, motivo, fechamento_id from wakeclub.lancamentos_comissao
        where vendedor_id = $1::uuid and venda_id is null`,
      [vid],
    );
    expect(saldo.rows).toEqual([
      { valor: -36, motivo: "saldo negativo de 2025-07", fechamento_id: null },
    ]);
    const ev = await db().query(
      `select metadados from wakeclub.eventos_automacao
        where tipo_evento = 'commission_paid' and entidade_id = $1::uuid`,
      [julho],
    );
    expect(ev.rows[0].metadados).toEqual({ vendedor_id: vid, mes: "2025-07", saldo_negativo: -36 });
    expect(await linhaDe("2025-08", vid)).toMatchObject({ ajustes: -36, aPagar: -36 });
  });

  test("venda atrasada de mês pago vira lançamento positivo", async () => {
    const vid = await vendedor(10);
    const adminId = await criarVendedor("Admin Fechamento");
    await vender(vid, "2025-08-10T15:00:00Z", 360);
    await pagar(vid, "2025-08", adminId);

    const atrasada = await vender(vid, "2025-08-20T15:00:00Z", 200);
    const estornada = await vender(vid, "2025-08-21T15:00:00Z", 300, { status: "estornada" });
    const semComissao = await vender(vid, "2025-08-22T15:00:00Z", 300, { comissiona: false });

    expect(await lancamentos(atrasada.vendaId)).toEqual([
      { valor: 20, motivo: "venda atrasada do mês 2025-08", fechamento_id: null },
    ]);
    expect(await lancamentos(estornada.vendaId)).toEqual([]);
    expect(await lancamentos(semComissao.vendaId)).toEqual([]);
    expect(await linhaDe("2025-08", vid)).toMatchObject({ quantidade: 1, totalComissao: 36 });

    // Venda sem dono do mês pago, vinculada depois pelo admin, também é atrasada.
    const l = await lead(vid, "2025-08-23T15:00:00Z", true);
    const semDono = await processar(venda({ compradaEm: "2025-08-23T15:00:00Z", valor: 100 }));
    await comTransacao((c) => vincular(c, semDono.vendaId, l.leadId, adminId));
    expect(await lancamentos(semDono.vendaId)).toMatchObject([{ valor: 10 }]);
    expect(await linhaDe("2025-09", vid)).toMatchObject({ ajustes: 30, aPagar: 30 });

    // Estorno da atrasada anula o positivo.
    await processar({ ...atrasada.v, status: "estornada" });
    expect((await lancamentos(atrasada.vendaId)).map((x) => x.valor)).toEqual([20, -20]);
    expect(await linhaDe("2025-09", vid)).toMatchObject({ ajustes: 10 });
  });
});
