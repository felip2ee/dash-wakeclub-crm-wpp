import { describe, expect, test } from "bun:test";

import { cotaAteAgora, dentroDaJanela, MODOS } from "./ritmo";

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

describe("cotaAteAgora", () => {
  // Hora cheia de São Paulo (UTC-3) em 04/11/2026.
  const as = (h: number) => new Date(Date.UTC(2026, 10, 4, h + 3, 30));

  test("conservador espalha 20 pelas 12 horas da janela", () => {
    const cota = MODOS.conservador.cotaDia;
    expect([7, 8, 9, 12, 18, 19, 20].map((h) => cotaAteAgora(cota, as(h)))).toEqual([
      0, 2, 4, 9, 19, 20, 20,
    ]);
  });

  test("aquecido libera 5 por hora", () => {
    expect([8, 13, 19].map((h) => cotaAteAgora(MODOS.aquecido.cotaDia, as(h)))).toEqual([
      5, 30, 60,
    ]);
  });
});
