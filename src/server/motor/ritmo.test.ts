import { describe, expect, test } from "bun:test";

import { dentroDaJanela, expiradoPorHorario, MODOS } from "./ritmo";

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

describe("expiradoPorHorario", () => {
  test("mesmo predicado de tarefaExpirarFollowups: outro dia de SP ou 20h em diante", () => {
    expect(expiradoPorHorario(sp("09:00"), sp("19:59"))).toBe(false);
    expect(expiradoPorHorario(sp("09:00"), sp("20:00"))).toBe(true);
    // 23h de ontem em SP já é 02h UTC de hoje: o dia conta em SP, não em UTC.
    expect(expiradoPorHorario(new Date("2026-11-03T23:00:00-03:00"), sp("08:00"))).toBe(true);
    expect(expiradoPorHorario(new Date("2026-11-04T00:30:00-03:00"), sp("08:00"))).toBe(false);
    expect(expiradoPorHorario(null, sp("10:00"))).toBe(false);
  });
});

test("MODOS", () => {
  expect(MODOS).toEqual({
    conservador: { cotaDia: 20, intervaloSegundos: 120 },
    aquecido: { cotaDia: 60, intervaloSegundos: 45 },
  });
});
