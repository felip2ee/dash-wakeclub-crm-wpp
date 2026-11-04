import { describe, expect, test } from "bun:test";

import { diaSP, mesAnterior, mesCorrente, rotuloMes } from "./periodo";

describe("período em São Paulo", () => {
  test("dia de São Paulo, não o UTC", () => {
    expect(diaSP(new Date("2026-11-01T02:30:00Z"))).toBe("2026-10-31");
    expect(diaSP(new Date("2026-11-01T03:30:00Z"))).toBe("2026-11-01");
  });

  test("mês corrente vai do dia 1 até hoje em São Paulo", () => {
    expect(mesCorrente(new Date("2026-11-01T02:30:00Z"))).toEqual({
      de: "2026-10-01",
      ate: "2026-10-31",
    });
  });

  test("mês anterior vira o ano", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesAnterior("2026-11")).toBe("2026-10");
  });

  test("rótulo do mês", () => {
    expect(rotuloMes("2026-03")).toBe("03/2026");
  });
});
