import { describe, expect, test } from "bun:test";

import { dentroDaJanela, MODOS } from "./ritmo";

// São Paulo é UTC-3 o ano todo (sem horário de verão desde 2019).
const sp = (hhmm: string) => new Date(`2026-11-04T${hhmm}:00-03:00`);

describe("dentroDaJanela", () => {
  test("8h às 19h59 de São Paulo, independente do fuso do processo", () => {
    expect(dentroDaJanela(sp("07:59"))).toBe(false);
    expect(dentroDaJanela(sp("08:00"))).toBe(true);
    expect(dentroDaJanela(sp("19:59"))).toBe(true);
    expect(dentroDaJanela(sp("20:00"))).toBe(false);
    expect(dentroDaJanela(sp("00:00"))).toBe(false);
  });
});

test("MODOS", () => {
  expect(MODOS).toEqual({
    conservador: { cotaDia: 20, intervaloSegundos: 120 },
    aquecido: { cotaDia: 60, intervaloSegundos: 45 },
  });
});
