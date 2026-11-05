import { describe, expect, test } from "bun:test";

import { deveEnviarComEnter } from "./teclado";

const enter = { key: "Enter", shiftKey: false, isComposing: false };

describe("deveEnviarComEnter", () => {
  test("Enter no desktop envia", () => {
    expect(deveEnviarComEnter(enter, false)).toBe(true);
  });
  test("Shift+Enter quebra linha", () => {
    expect(deveEnviarComEnter({ ...enter, shiftKey: true }, false)).toBe(false);
  });
  test("Enter durante composição (IME, acentos) não envia", () => {
    expect(deveEnviarComEnter({ ...enter, isComposing: true }, false)).toBe(false);
  });
  test("no toque Enter quebra linha", () => {
    expect(deveEnviarComEnter(enter, true)).toBe(false);
  });
  test("outra tecla não envia", () => {
    expect(deveEnviarComEnter({ ...enter, key: "a" }, false)).toBe(false);
  });
});
