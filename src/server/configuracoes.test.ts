import { describe, expect, test } from "bun:test";

import { montarWebhook } from "./configuracoes";

describe("montarWebhook", () => {
  test("monta URL e URL com token, com o segredo codificado", () => {
    expect(montarWebhook("https://crm.exemplo.com", "/api/webhooks/vendas", "a b&c=d")).toEqual({
      url: "https://crm.exemplo.com/api/webhooks/vendas",
      segredo: "a b&c=d",
      urlComToken: "https://crm.exemplo.com/api/webhooks/vendas?token=a+b%26c%3Dd",
    });
  });

  test("sem segredo não oferece URL com token", () => {
    expect(montarWebhook("http://localhost:3001", "/api/webhooks/evolution", undefined)).toEqual({
      url: "http://localhost:3001/api/webhooks/evolution",
      segredo: null,
      urlComToken: null,
    });
    expect(
      montarWebhook("http://localhost:3001", "/api/webhooks/evolution", "").segredo,
    ).toBeNull();
  });
});
