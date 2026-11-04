import { beforeEach, describe, expect, test } from "bun:test";

import { getPoolMotor } from "../db";
import { enfileirar } from "../webhooks/receber";
import { bancoTesteAtivo } from "./banco-teste";
import { devolverOrfaos, reivindicar, reprocessar, registrarFalha, rodarFila } from "./fila";

const db = () => getPoolMotor();
const EVO = ["evolution"];

async function status(id: number) {
  const { rows } = await db().query(
    "select status, tentativas from wakeclub.webhook_eventos where id = $1::bigint",
    [id],
  );
  return rows[0] as { status: string; tentativas: number };
}

describe.skipIf(!bancoTesteAtivo)("fila de entrada", () => {
  beforeEach(async () => {
    // Fecha o que outros testes deixaram aberto: cada teste controla a fila inteira.
    await db().query(
      "update wakeclub.webhook_eventos set status = 'ignorado' where status in ('pendente','processando')",
    );
  });

  test("ordem por chave", async () => {
    const a1 = await enfileirar(db(), "evolution", { n: "a1" }, "A");
    await enfileirar(db(), "evolution", { n: "a2" }, "A");
    await enfileirar(db(), "evolution", { n: "a3" }, "A");
    const b1 = await enfileirar(db(), "evolution", { n: "b1" }, "B");
    const pegos = await reivindicar(db(), 10, EVO);
    expect(pegos.map((e) => e.id).sort()).toEqual([a1, b1].sort());
  });

  test("cabeca processando bloqueia", async () => {
    await enfileirar(db(), "evolution", {}, "A");
    await enfileirar(db(), "evolution", {}, "A");
    expect(await reivindicar(db(), 10, EVO)).toHaveLength(1);
    expect(await reivindicar(db(), 10, EVO)).toHaveLength(0);
  });

  test("reprocessar nao fura chave com evento processando", async () => {
    // Mesmo caso de dois inserts que commitam fora da ordem do id: o menor vira
    // cabeça depois que o maior já está em processamento.
    const a1 = await enfileirar(db(), "evolution", {}, "RP");
    const a2 = await enfileirar(db(), "evolution", {}, "RP");
    await db().query(
      "update wakeclub.webhook_eventos set status = 'falhou' where id = $1::bigint",
      [a1],
    );
    expect((await reivindicar(db(), 10, EVO)).map((e) => e.id)).toEqual([a2]);
    expect(await reprocessar(db(), a1)).toBe(true);
    expect(await reivindicar(db(), 10, EVO)).toHaveLength(0);
  });

  test("reprocessar recusa linha descartada por tamanho", async () => {
    const { rows } = await db().query(
      `insert into wakeclub.webhook_eventos (origem, corpo, status)
       values ('evolution', '{"descartado":true,"tamanho":9}'::jsonb, 'falhou') returning id`,
    );
    const id = Number(rows[0].id);
    expect(await reprocessar(db(), id)).toBe(false);
    expect((await status(id)).status).toBe("falhou");
  });

  test("dois reivindicadores", async () => {
    for (const chave of ["A", "A", "B", "B", "C"]) await enfileirar(db(), "evolution", {}, chave);
    const [c1, c2] = [await db().connect(), await db().connect()];
    try {
      await c1.query("begin");
      await c2.query("begin");
      const p1 = await reivindicar(c1, 10, EVO);
      const p2 = await reivindicar(c2, 10, EVO);
      await c1.query("commit");
      await c2.query("commit");
      const ids = [...p1, ...p2].map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(3);
      const { rows } = await db().query(
        `select chave_ordem, count(*)::int as n from wakeclub.webhook_eventos
          where status = 'processando' group by chave_ordem`,
      );
      expect(rows.every((r) => r.n === 1)).toBe(true);
    } finally {
      c1.release();
      c2.release();
    }
  });

  test("cinco falhas viram falhou", async () => {
    const id = await enfileirar(db(), "evolution", {}, "F");
    // Só evento em processamento registra falha: simula a reivindicação a cada volta.
    const falhar = async () => {
      await db().query(
        "update wakeclub.webhook_eventos set status = 'processando' where id = $1::bigint",
        [id],
      );
      await registrarFalha(db(), id, "erro de teste");
    };
    for (let i = 0; i < 4; i++) {
      await falhar();
      expect((await status(id)).status).toBe("pendente");
    }
    await falhar();
    expect(await status(id)).toEqual({ status: "falhou", tentativas: 5 });
    await registrarFalha(db(), id, "falha fora de processamento");
    expect(await status(id)).toEqual({ status: "falhou", tentativas: 5 });
    await reprocessar(db(), id);
    expect(await status(id)).toEqual({ status: "pendente", tentativas: 0 });
  });

  test("orfao volta", async () => {
    const id = await enfileirar(db(), "evolution", {}, "O");
    await db().query(
      `update wakeclub.webhook_eventos
          set status = 'processando', processando_desde = now() - interval '16 minutes'
        where id = $1::bigint`,
      [id],
    );
    expect(await devolverOrfaos(db())).toBeGreaterThanOrEqual(1);
    expect((await status(id)).status).toBe("pendente");
  });

  test("origem sem processador fica pendente", async () => {
    const id = await enfileirar(db(), "vendas", {}, null);
    await rodarFila({});
    expect((await status(id)).status).toBe("pendente");
  });

  test("rodarFila processa e conclui; falha volta para a fila", async () => {
    const ok = await enfileirar(db(), "evolution", { ok: true }, "R1");
    const ruim = await enfileirar(db(), "evolution", { ok: false }, "R2");
    await rodarFila({
      evolution: async (_c, evento) => {
        if ((evento.corpo as { ok: boolean }).ok) return "processado";
        throw new Error("falha de teste");
      },
    });
    expect((await status(ok)).status).toBe("processado");
    expect(await status(ruim)).toEqual({ status: "pendente", tentativas: 1 });
  });
});
