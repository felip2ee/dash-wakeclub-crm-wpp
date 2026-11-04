import { describe, expect, test } from "bun:test";

import { getPoolMotor } from "./db";
import { lerMonitorFila, reprocessarOuFalhar } from "./admin-motor";
import { bancoTesteAtivo } from "./motor/banco-teste";
import { enfileirar } from "./webhooks/receber";

const db = () => getPoolMotor();

describe.skipIf(!bancoTesteAtivo)("admin do motor no banco", () => {
  test("reprocessar volta falhou para pendente com tentativas zeradas", async () => {
    const id = await enfileirar(db(), "evolution", { n: "x" }, `t10-${Date.now()}`);
    await db().query(
      "update wakeclub.webhook_eventos set status='falhou', tentativas=5, erro='boom' where id=$1::bigint",
      [id],
    );
    const comFalha = await lerMonitorFila(db());
    expect(comFalha.falhas.find((f) => f.id === id)?.tentativas).toBe(5);
    // Contagem própria, sem o limite de 50 da lista.
    const { rows: total } = await db().query(
      "select count(*)::int as n from wakeclub.webhook_eventos where status = 'falhou'",
    );
    expect(comFalha.falhos).toBe(total[0].n);

    await reprocessarOuFalhar(db(), id);
    const { rows } = await db().query(
      "select status, tentativas, erro from wakeclub.webhook_eventos where id=$1::bigint",
      [id],
    );
    expect(rows[0]).toEqual({ status: "pendente", tentativas: 0, erro: null });
    expect((await lerMonitorFila(db())).falhos).toBe(comFalha.falhos - 1);
    await expect(reprocessarOuFalhar(db(), id)).rejects.toThrow();
  });
});
