import { describe, expect, test } from "bun:test";

import { totalPesoAtivo, validarPesoComissao } from "./peso";

describe("totalPesoAtivo", () => {
  test("soma só o peso de quem está ativo", () => {
    expect(
      totalPesoAtivo([
        { ativo: true, peso: 3 },
        { ativo: false, peso: 5 },
        { ativo: true, peso: 1 },
        { ativo: true, peso: 0 },
      ]),
    ).toBe(4);
  });

  test("sem ninguém ativo é zero", () => {
    expect(totalPesoAtivo([])).toBe(0);
    expect(totalPesoAtivo([{ ativo: false, peso: 2 }])).toBe(0);
  });
});

describe("validarPesoComissao", () => {
  test("aceita peso inteiro 0–10 e comissão 0–100 com vírgula", () => {
    expect(validarPesoComissao("3", "8,5")).toEqual({ ok: true, peso: 3, comissaoPct: 8.5 });
    expect(validarPesoComissao("0", "0")).toEqual({ ok: true, peso: 0, comissaoPct: 0 });
    expect(validarPesoComissao("10", "100")).toEqual({ ok: true, peso: 10, comissaoPct: 100 });
  });

  test("campo vazio não vira zero", () => {
    expect(validarPesoComissao("", "5").ok).toBe(false);
    expect(validarPesoComissao("  ", "5").ok).toBe(false);
    expect(validarPesoComissao("2", "").ok).toBe(false);
  });

  test("recusa peso fora de 0–10, fracionado ou não numérico", () => {
    for (const peso of ["11", "-1", "1.5", "abc"]) {
      const r = validarPesoComissao(peso, "5");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro).toContain("Peso");
    }
  });

  test("recusa comissão fora de 0–100 ou não numérica", () => {
    for (const pct of ["101", "-0.1", "x"]) {
      const r = validarPesoComissao("1", pct);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro).toContain("Comissão");
    }
  });
});
