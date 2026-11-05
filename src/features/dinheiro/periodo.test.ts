import { describe, expect, test } from "bun:test";

import {
  atalhoDe,
  diaSP,
  hoje,
  mesAnterior,
  mesCorrente,
  rotuloMes,
  ultimos7Dias,
} from "./periodo";

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

describe("atalhos de período", () => {
  const agora = new Date("2026-11-05T15:00:00Z");

  test("hoje e últimos 7 dias em São Paulo", () => {
    expect(hoje(agora)).toEqual({ de: "2026-11-05", ate: "2026-11-05" });
    expect(ultimos7Dias(agora)).toEqual({ de: "2026-10-30", ate: "2026-11-05" });
    expect(ultimos7Dias(new Date("2026-11-06T01:00:00Z"))).toEqual({
      de: "2026-10-30",
      ate: "2026-11-05",
    });
  });

  test("atalho ativo é derivado das datas", () => {
    expect(atalhoDe({ de: "2026-11-05", ate: "2026-11-05" }, agora)).toBe("hoje");
    expect(atalhoDe({ de: "2026-10-30", ate: "2026-11-05" }, agora)).toBe("7dias");
    expect(atalhoDe({ de: "2026-11-01", ate: "2026-11-05" }, agora)).toBe("mes");
    expect(atalhoDe({ de: "2026-10-01", ate: "2026-10-31" }, agora)).toBe("personalizado");
  });
});
