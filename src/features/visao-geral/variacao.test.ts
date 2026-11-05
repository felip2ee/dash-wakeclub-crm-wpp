import { expect, test } from "bun:test";

import { textoVariacao } from "./variacao";

test.each([
  [5, 4, "+25% vs. período anterior"],
  [3, 5, "−40% vs. período anterior"],
  [4, 4, "igual ao período anterior"],
  [0, 0, "igual ao período anterior"],
  [3, 0, "antes: 0"],
])("textoVariacao(%d, %d)", (atual, anterior, esperado) => {
  expect(textoVariacao(atual, anterior)).toBe(esperado);
});
