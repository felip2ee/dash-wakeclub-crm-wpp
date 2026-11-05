import { describe, expect, test } from "bun:test";

import { readFileSync } from "node:fs";

import { getPoolMotor } from "../db";
import { bancoTesteAtivo } from "../motor/banco-teste";
import { receberWebhook } from "./receber";

describe.skipIf(!bancoTesteAtivo)("webhook grava bruto", () => {
  test("grava bruto e responde 200", async () => {
    process.env.WEBHOOK_VENDAS_SECRET = "vendas-teste";
    const corpo = { venda: { id: crypto.randomUUID(), valor: 360 } };
    const r = await receberWebhook(
      "vendas",
      new Request("http://local/api/webhooks/vendas?token=vendas-teste", {
        method: "POST",
        body: JSON.stringify(corpo),
      }),
    );
    expect(r.status).toBe(200);
    const { id } = (await r.json()) as { id: number };
    const { rows } = await getPoolMotor().query(
      "select origem, status, corpo, chave_ordem from wakeclub.webhook_eventos where id = $1::bigint",
      [id],
    );
    expect(rows[0]).toEqual({ origem: "vendas", status: "pendente", corpo, chave_ordem: null });
  });

  test("caractere nulo some antes do jsonb e a linha e gravada", async () => {
    process.env.WEBHOOK_VENDAS_SECRET = "vendas-teste";
    const r = await receberWebhook(
      "vendas",
      new Request("http://local/api/webhooks/vendas?token=vendas-teste", {
        method: "POST",
        body: JSON.stringify({ t: "a\u0000b", barra: "\\u0000" }),
      }),
    );
    expect(r.status).toBe(200);
    const { id } = (await r.json()) as { id: number };
    const { rows } = await getPoolMotor().query(
      "select corpo from wakeclub.webhook_eventos where id = $1::bigint",
      [id],
    );
    // Só o nulo de verdade sai; o texto literal "\u0000" fica como veio.
    expect(rows[0].corpo).toEqual({ t: "ab", barra: "\\u0000" });
  });

  test("evolution sem adaptador vai na chave unica", async () => {
    process.env.WEBHOOK_EVOLUTION_SECRET = "evo-teste";
    const r = await receberWebhook(
      "evolution",
      new Request("http://local/api/webhooks/evolution", {
        method: "POST",
        body: JSON.stringify({ event: "teste" }),
        headers: { "x-webhook-secret": "evo-teste" },
      }),
    );
    const { id } = (await r.json()) as { id: number };
    const { rows } = await getPoolMotor().query(
      "select chave_ordem from wakeclub.webhook_eventos where id = $1::bigint",
      [id],
    );
    expect(rows[0].chave_ordem).toBe("evolution");
  });

  test("evolution grava o corpo sem o apikey de nivel superior", async () => {
    process.env.WEBHOOK_EVOLUTION_SECRET = "evo-teste";
    const r = await receberWebhook(
      "evolution",
      new Request("http://local/api/webhooks/evolution", {
        method: "POST",
        body: JSON.stringify({ event: "teste", data: { apikey: "interno" }, apikey: "global" }),
        headers: { "x-webhook-secret": "evo-teste" },
      }),
    );
    const { id } = (await r.json()) as { id: number };
    const { rows } = await getPoolMotor().query(
      "select corpo from wakeclub.webhook_eventos where id = $1::bigint",
      [id],
    );
    expect(rows[0].corpo).toEqual({ event: "teste", data: { apikey: "interno" } });
  });

  test("migração 0006 tira o apikey de linhas antigas e é idempotente", async () => {
    const { rows } = await getPoolMotor().query<{ id: string }>(
      `insert into wakeclub.webhook_eventos (origem, corpo)
       values ('evolution', '{"event":"x","apikey":"global"}'::jsonb) returning id`,
    );
    const sql = readFileSync("db/migrations/0006_webhook_sem_apikey.sql", "utf8");
    await getPoolMotor().query(sql);
    await getPoolMotor().query(sql);
    const { rows: depois } = await getPoolMotor().query(
      "select corpo from wakeclub.webhook_eventos where id = $1::bigint",
      [rows[0].id],
    );
    expect(depois[0].corpo).toEqual({ event: "x" });
  });

  test("corpo acima de 25 MB responde 413 e fica registrado como falhou", async () => {
    process.env.WEBHOOK_EVOLUTION_SECRET = "evo-teste";
    const tamanho = 25 * 1024 * 1024 + 1;
    const r = await receberWebhook(
      "evolution",
      new Request("http://local/api/webhooks/evolution", {
        method: "POST",
        body: "a".repeat(tamanho),
        headers: { "x-webhook-secret": "evo-teste" },
      }),
    );
    expect(r.status).toBe(413);
    const { id } = (await r.json()) as { id: number };
    const { rows } = await getPoolMotor().query(
      `select origem, status, corpo, erro, chave_ordem
         from wakeclub.webhook_eventos where id = $1::bigint`,
      [id],
    );
    expect(rows[0]).toEqual({
      origem: "evolution",
      status: "falhou",
      corpo: { descartado: true, tamanho },
      erro: "corpo acima do limite de 25 MB",
      chave_ordem: null,
    });
  });
});
