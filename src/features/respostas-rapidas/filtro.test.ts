import { describe, expect, test } from "bun:test";

import { filtrarPorAtalho, type RespostaRapida } from "./filtro";

const r = (atalho: string): RespostaRapida => ({ id: atalho, atalho, texto: "t", ativo: true });
const lista = ["preco", "pix", "boas-vindas", "a1", "a2", "a3", "a4", "a5", "a6", "a7"].map(r);

describe("filtrarPorAtalho", () => {
  test('"/" lista todas ate 8', () => {
    expect(filtrarPorAtalho(lista, "/")).toHaveLength(8);
  });
  test('"/pre" filtra por prefixo', () => {
    expect(filtrarPorAtalho(lista, "/pre").map((x) => x.atalho)).toEqual(["preco"]);
  });
  test("sem barra nao abre", () => {
    expect(filtrarPorAtalho(lista, "pre")).toEqual([]);
  });
});
