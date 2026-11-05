import { describe, expect, test } from "bun:test";

import { valorCheio, valorEsperado } from "./valor";

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
    expect(valorEsperado(lead(), 360)).toBe(576);
  });

  test("Novo lead sem temperatura vale 5%", () => {
    expect(valorEsperado(lead({ etiqueta: "Novo lead", temperatura: null }), 360)).toBe(72);
  });

  test("Aluno sem horas quente, 4h a R$ 360", () => {
    expect(valorEsperado(lead({ etiqueta: "Aluno sem horas" }), 360)).toBe(432);
  });

  test("Cadastrado morno, 1h a R$ 360", () => {
    expect(
      valorEsperado(lead({ etiqueta: "Cadastrado", temperatura: "morno", horasEstimadas: 1 }), 360),
    ).toBe(108);
  });

  test("etapa fora da tabela vale 5%; horas ausentes contam 1", () => {
    expect(valorEsperado(lead({ etiqueta: "Outra", horasEstimadas: null }), 360)).toBe(18);
  });

  test("fora do pipeline vale 0", () => {
    expect(valorEsperado(lead({ optOut: true }), 360)).toBe(0);
    expect(valorEsperado(lead({ semAtendimento: true }), 360)).toBe(0);
    expect(valorEsperado(lead({ etiqueta: "Encerrado" }), 360)).toBe(0);
    expect(valorEsperado(lead({ etiqueta: "Aluno com horas" }), 360)).toBe(0);
  });

  test("valor cheio", () => {
    expect(valorCheio(3, 360)).toBe(1080);
    expect(valorCheio(null, 360)).toBe(360);
  });
});
