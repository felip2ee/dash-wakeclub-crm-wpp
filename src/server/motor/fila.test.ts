import { describe, expect, test } from "bun:test";

import { esperaAposFalha } from "./fila";

describe("espera após falha", () => {
  test("cresce a cada tentativa e desiste na quinta", () => {
    expect([1, 2, 3, 4, 5].map(esperaAposFalha)).toEqual([30, 120, 600, 1800, null]);
  });
});
