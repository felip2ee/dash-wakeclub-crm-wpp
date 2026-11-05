import { describe, expect, test } from "bun:test";

import { gravarMetaVendasDia, gravarPrecoHora, lerConfiguracoes } from "./configuracoes";
import { getPoolRw } from "./db";
import { bancoTesteAtivo } from "./motor/banco-teste";

const db = () => getPoolRw();

describe.skipIf(!bancoTesteAtivo)("preço da hora no banco", () => {
  test("lê o padrão da migração e grava um novo valor pela painel_rw", async () => {
    const antes = await lerConfiguracoes(db());
    expect(antes.precoHora).toBeGreaterThan(0);

    await gravarPrecoHora(db(), 412.5);
    expect((await lerConfiguracoes(db())).precoHora).toBe(412.5);

    // O motor lê o valor como texto do jsonb (#>> '{}'): precisa continuar numérico.
    const { rows } = await db().query(
      `select jsonb_typeof(valor) as tipo from wakeclub.configuracoes where chave = 'preco_hora'`,
    );
    expect(rows[0].tipo).toBe("number");

    await gravarPrecoHora(db(), antes.precoHora);
  });

  test("lê a meta padrão 2 e grava um inteiro pela painel_rw", async () => {
    expect((await lerConfiguracoes(db())).metaVendasDia).toBe(2);
    await gravarMetaVendasDia(db(), 3);
    expect((await lerConfiguracoes(db())).metaVendasDia).toBe(3);
    const { rows } = await db().query(
      `select jsonb_typeof(valor) as tipo from wakeclub.configuracoes where chave = 'meta_vendas_dia'`,
    );
    expect(rows[0].tipo).toBe("number");
    await gravarMetaVendasDia(db(), 2);
  });
});
