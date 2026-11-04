import { describe, expect, test } from "bun:test";

import { valorCheio, valorEsperado } from "./valor";

const AGORA = new Date("2026-11-04T15:00:00Z");

const lead = (extra: Partial<Parameters<typeof valorEsperado>[0]> = {}) => ({
  etiqueta: "Link enviado",
  temperatura: "quente" as string | null,
  horasEstimadas: 4 as number | null,
  optOut: false,
  semAtendimento: false,
  dataAgendada: null as string | null,
  ...extra,
});

describe("valor esperado", () => {
  test("Link enviado quente, 4h a R$ 360", () => {
    expect(valorEsperado(lead(), 360, AGORA)).toBe(576);
  });

  test("Novo Lead sem temperatura vale 5%", () => {
    expect(valorEsperado(lead({ etiqueta: "Novo Lead", temperatura: null }), 360, AGORA)).toBe(72);
  });

  test("etapa fora da tabela vale 5%; horas ausentes contam 1", () => {
    const agendado = lead({ etiqueta: "Agendado", horasEstimadas: null });
    expect(valorEsperado({ ...agendado, dataAgendada: "2026-11-05T15:00:00Z" }, 360, AGORA)).toBe(
      18,
    );
  });

  test("Agendado no passado vale 0", () => {
    const l = lead({ etiqueta: "Agendado", dataAgendada: "2026-11-03T15:00:00Z" });
    expect(valorEsperado(l, 360, AGORA)).toBe(0);
  });

  test("fora do pipeline vale 0", () => {
    expect(valorEsperado(lead({ optOut: true }), 360, AGORA)).toBe(0);
    expect(valorEsperado(lead({ semAtendimento: true }), 360, AGORA)).toBe(0);
    expect(valorEsperado(lead({ etiqueta: "Negociação encerrada" }), 360, AGORA)).toBe(0);
    expect(valorEsperado(lead({ etiqueta: "Aula realizada" }), 360, AGORA)).toBe(0);
  });

  test("valor cheio", () => {
    expect(valorCheio(3, 360)).toBe(1080);
    expect(valorCheio(null, 360)).toBe(360);
  });
});
