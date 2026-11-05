import { expect, test } from "bun:test";

import { textoMinutos } from "./formato";

test.each([
  [null, "—"],
  [0, "0 min"],
  [32, "32 min"],
  [59.6, "1 h 00"],
  [65, "1 h 05"],
  [130, "2 h 10"],
])("textoMinutos(%p)", (min, esperado) => {
  expect(textoMinutos(min)).toBe(esperado);
});
