import { describe, expect, test } from "bun:test";

import { receberWebhook, segredoConfere } from "./receber";

describe("segredo do webhook", () => {
  test("segredo ausente no env nega", () => {
    expect(segredoConfere("qualquer", undefined)).toBe(false);
    expect(segredoConfere("qualquer", "")).toBe(false);
  });

  test("segredo errado nega", () => {
    expect(segredoConfere("errado", "certo")).toBe(false);
    expect(segredoConfere(null, "certo")).toBe(false);
  });

  test("segredo certo aceita", () => {
    expect(segredoConfere("certo", "certo")).toBe(true);
  });
});

describe("receberWebhook sem tocar no banco", () => {
  process.env.WEBHOOK_EVOLUTION_SECRET = "segredo-teste";
  const url = "http://local/api/webhooks/evolution";

  test("segredo invalido responde 404", async () => {
    const r = await receberWebhook(
      "evolution",
      new Request(`${url}?token=outro`, { method: "POST", body: "{}" }),
    );
    expect(r.status).toBe(404);
  });

  test("corpo que nao e JSON responde 400", async () => {
    const r = await receberWebhook(
      "evolution",
      new Request(`${url}?token=segredo-teste`, { method: "POST", body: "isto não é json" }),
    );
    expect(r.status).toBe(400);
  });
});
