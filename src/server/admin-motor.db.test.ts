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

  test("horas sem saldo traz as ocorrências com o nome do lead", async () => {
    const chave = `t14-${Date.now()}`;
    const { rows } = await db().query(
      `insert into wakeclub.leads (nome, telefone) values ('Lead T14', $1::text) returning id`,
      [`+55119${String(Date.now()).slice(-8)}`],
    );
    await db().query(
      `insert into wakeclub.app_eventos (tipo, chave, lead_id, ocorrido_em, resultado)
       values ('compra_paga', $1::text, $2::uuid, now(), 'hora_sem_saldo')`,
      [chave, rows[0].id],
    );
    const { horasSemSaldo } = await lerMonitorFila(db());
    const achado = horasSemSaldo.find((h) => h.leadNome === "Lead T14");
    expect(achado?.telefone).toMatch(/^\+55119/);
    expect(new Date(achado?.ocorridoEm ?? "").getTime()).not.toBeNaN();
  });
});
