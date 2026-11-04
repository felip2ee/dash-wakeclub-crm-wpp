import { describe, expect, test } from "bun:test";

import { MOTIVOS_ENVIO, MOTIVOS_RECUSA, validarMotivos } from "./motivos";

describe("motivos da folha de decisão", () => {
  test("listas iguais às da spec das fases 2–3 §8", () => {
    expect([...MOTIVOS_RECUSA]).toEqual([
      "Cedo demais",
      "Tom errado",
      "Já falei com ele",
      "Repetiu assunto",
      "Lead não quer",
      "Outro",
    ]);
    expect([...MOTIVOS_ENVIO]).toEqual(["Texto certo", "Lead quente", "Ajustei o texto", "Outro"]);
  });

  test("sem motivos vale (Pular grava motivos vazios)", () => {
    expect(validarMotivos("enviar", [])).toBe(true);
    expect(validarMotivos("recusar", [])).toBe(true);
  });

  test("aceita só motivos da própria decisão", () => {
    expect(validarMotivos("recusar", ["Tom errado", "Outro"])).toBe(true);
    expect(validarMotivos("enviar", ["Texto certo", "Lead quente"])).toBe(true);
    expect(validarMotivos("enviar", ["Tom errado"])).toBe(false);
    expect(validarMotivos("recusar", ["Texto certo"])).toBe(false);
    expect(validarMotivos("recusar", ["qualquer coisa"])).toBe(false);
  });

  test("recusa motivo repetido", () => {
    expect(validarMotivos("recusar", ["Outro", "Outro"])).toBe(false);
  });
});
