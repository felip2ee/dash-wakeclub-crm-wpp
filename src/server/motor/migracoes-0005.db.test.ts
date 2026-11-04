import { describe, expect, test } from "bun:test";

import { getPool, getPoolMotor, getPoolRw } from "../db";
import { bancoTesteAtivo, criarVendedor } from "./banco-teste";

const codigo = (e: unknown) => (e as { code?: string }).code;

async function inserirVenda(idExterno: string, categoria: string | null = null) {
  return getPoolMotor().query(
    `insert into wakeclub.vendas (id_externo, comprada_em, valor, categoria)
     values ($1::text, now(), 360, $2::text) returning id`,
    [idExterno, categoria],
  );
}

describe.skipIf(!bancoTesteAtivo)("migração 0005", () => {
  test("vendas rejeita categoria e status inválidos", async () => {
    const id = `t-${crypto.randomUUID()}`;
    expect(codigo(await inserirVenda(id, "xyz").catch((e) => e))).toBe("23514");
    expect((await inserirVenda(id, "follow-up")).rowCount).toBe(1);
    const status = await getPoolMotor()
      .query(
        `insert into wakeclub.vendas (id_externo, comprada_em, valor, status)
         values ($1::text, now(), 1, 'x')`,
        [`t-${crypto.randomUUID()}`],
      )
      .catch((e) => e);
    expect(codigo(status)).toBe("23514");
  });

  test("unique (origem_externa, id_externo)", async () => {
    const id = `t-${crypto.randomUUID()}`;
    await inserirVenda(id);
    expect(codigo(await inserirVenda(id).catch((e) => e))).toBe("23505");
  });

  test("fechamentos único por vendedor e mês; lançamentos ligam venda", async () => {
    const motor = getPoolMotor();
    const vendedor = await criarVendedor("Fechamento");
    const f = await motor.query<{ id: string }>(
      "insert into wakeclub.fechamentos (vendedor_id, mes) values ($1::uuid, '2026-10-01') returning id",
      [vendedor],
    );
    const dup = await motor
      .query(
        "insert into wakeclub.fechamentos (vendedor_id, mes) values ($1::uuid, '2026-10-01')",
        [vendedor],
      )
      .catch((e) => e);
    expect(codigo(dup)).toBe("23505");
    const v = await inserirVenda(`t-${crypto.randomUUID()}`);
    await motor.query(
      `insert into wakeclub.lancamentos_comissao (vendedor_id, venda_id, fechamento_id, valor, motivo)
       values ($1::uuid, $2::uuid, $3::uuid, -36, 'estorno')`,
      [vendedor, v.rows[0].id, f.rows[0].id],
    );
  });

  test("leads.cpf e evento de venda sem lead", async () => {
    const motor = getPoolMotor();
    await motor.query("select cpf from wakeclub.leads limit 1");
    const ev = (entidade: string) =>
      motor
        .query(
          `insert into wakeclub.eventos_automacao
             (agente, tipo_evento, entidade_tipo, entidade_id, origem_tipo, correlacao_id)
           values ('sistema', 'sale_received', $1::text, gen_random_uuid(), 'motor', $2::text)`,
          [entidade, `teste:${crypto.randomUUID()}`],
        )
        .catch((e) => e);
    expect((await ev("venda")) as { rowCount?: number }).toMatchObject({ rowCount: 1 });
    expect(codigo(await ev("lead"))).toBe("23514");
  });

  test("grants: painel_ro lê, painel_rw não", async () => {
    for (const t of ["vendas", "fechamentos", "lancamentos_comissao"]) {
      await getPool().query(`select 1 from wakeclub.${t} limit 1`);
      const erro = await getPoolRw()
        .query(`select 1 from wakeclub.${t} limit 1`)
        .catch((e) => e);
      expect(codigo(erro)).toBe("42501");
    }
  });
});
