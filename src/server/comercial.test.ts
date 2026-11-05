import { expect, test } from "bun:test";

import { diasDoPeriodo, periodoAnterior, resumoMeta } from "./comercial";

test("diasDoPeriodo e periodoAnterior", () => {
  expect(diasDoPeriodo({ de: "2026-10-01", ate: "2026-10-31" })).toBe(31);
  expect(periodoAnterior({ de: "2026-10-01", ate: "2026-10-31" })).toEqual({
    de: "2026-08-31",
    ate: "2026-09-30",
  });
  // Review Focus 5: N dias imediatamente antes de `de`, sem sobreposição.
  expect(periodoAnterior({ de: "2026-11-01", ate: "2026-11-05" })).toEqual({
    de: "2026-10-27",
    ate: "2026-10-31",
  });
  expect(periodoAnterior({ de: "2026-11-05", ate: "2026-11-05" })).toEqual({
    de: "2026-11-04",
    ate: "2026-11-04",
  });
});

test("resumoMeta no mês corrente projeta; fora dele não", () => {
  const agora = new Date("2026-11-05T15:00:00Z");
  expect(
    resumoMeta({ periodo: { de: "2026-11-01", ate: "2026-11-05" }, metaDia: 2, vendas: 4, agora }),
  ).toEqual({
    porDia: 2,
    periodo: 10,
    atingidoPct: 40,
    mesCorrente: true,
    diasDecorridos: 5,
    projecaoMes: 24,
  });
  expect(
    resumoMeta({ periodo: { de: "2026-10-01", ate: "2026-10-31" }, metaDia: 2, vendas: 2, agora }),
  ).toMatchObject({ periodo: 62, atingidoPct: 3, mesCorrente: false, projecaoMes: null });
  expect(
    resumoMeta({ periodo: { de: "2026-11-05", ate: "2026-11-05" }, metaDia: 0, vendas: 1, agora })
      .atingidoPct,
  ).toBe(0);
});
