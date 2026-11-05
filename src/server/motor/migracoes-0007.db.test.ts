import { describe, expect, test } from "bun:test";

import { getPool, getPoolMotor, getPoolRw } from "../db";
import { bancoTesteAtivo, telefoneUnico } from "./banco-teste";

const codigo = (e: unknown) => (e as { code?: string }).code;

async function inserirLead(canal: string, app: string | null) {
  return getPoolMotor().query(
    `insert into wakeclub.leads (telefone, origem_canal, origem_app)
     values ($1::text, $2::text, $3::text)`,
    [telefoneUnico(), canal, app],
  );
}

describe.skipIf(!bancoTesteAtivo)("migração 0007", () => {
  test("colunas de origem aceitam só os canais e apps da spec", async () => {
    expect(codigo(await inserirLead("xyz", null).catch((e) => e))).toBe("23514");
    expect((await inserirLead("anuncio", "instagram")).rowCount).toBe(1);
    expect(codigo(await inserirLead("anuncio", "tiktok").catch((e) => e))).toBe("23514");
  });

  test("meta_vendas_dia nasce 2 como número jsonb", async () => {
    const { rows } = await getPoolMotor().query(
      `select valor #>> '{}' as texto, jsonb_typeof(valor) as tipo
         from wakeclub.configuracoes where chave = 'meta_vendas_dia'`,
    );
    expect(rows[0]).toEqual({ texto: "2", tipo: "number" });
  });

  test("painel_rw lê e atualiza meta_vendas_dia; painel_ro só lê", async () => {
    const upd = `update wakeclub.configuracoes set valor = valor where chave = 'meta_vendas_dia'`;
    expect((await getPoolRw().query(upd)).rowCount).toBe(1);
    expect(
      codigo(
        await getPool()
          .query(upd)
          .catch((e) => e),
      ),
    ).toBe("25006");
  });
});
