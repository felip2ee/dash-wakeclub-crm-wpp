import { describe, expect, test } from "bun:test";

import { categoriaDaVenda, comissaoDaVenda } from "./regras";

const compra = new Date("2026-11-10T12:00:00Z");
const horasAntes = (h: number) => new Date(compra.getTime() - h * 3600_000);
const base = {
  compradaEm: compra,
  followupEnviadoEm: null,
  mensagemEquipeEm: null,
  tinhaVendaAnterior: false,
};

describe("categoriaDaVenda", () => {
  test("follow-up dentro de 48h, limite incluso", () => {
    expect(categoriaDaVenda({ ...base, followupEnviadoEm: horasAntes(48) }).categoria).toBe(
      "follow-up",
    );
    expect(categoriaDaVenda({ ...base, followupEnviadoEm: horasAntes(1) }).categoria).toBe(
      "follow-up",
    );
  });
  test("follow-up com 48h01 fica fora", () => {
    const fora = new Date(horasAntes(48).getTime() - 60_000);
    expect(categoriaDaVenda({ ...base, followupEnviadoEm: fora }).categoria).toBe("espontanea");
  });
  test("follow-up depois da compra não conta", () => {
    const depois = new Date(compra.getTime() + 1000);
    expect(categoriaDaVenda({ ...base, followupEnviadoEm: depois }).categoria).toBe("espontanea");
  });
  test("follow-up vence mensagem da equipe", () => {
    const r = categoriaDaVenda({
      ...base,
      followupEnviadoEm: horasAntes(5),
      mensagemEquipeEm: horasAntes(2),
    });
    expect(r.categoria).toBe("follow-up");
  });
  test("mensagem da equipe vira atendimento", () => {
    const r = categoriaDaVenda({ ...base, mensagemEquipeEm: horasAntes(30) });
    expect(r.categoria).toBe("atendimento");
    expect(r.motivo).toBeString();
  });
  test("sem interação: recompra se havia venda, senão espontânea", () => {
    expect(categoriaDaVenda({ ...base, tinhaVendaAnterior: true }).categoria).toBe("recompra");
    expect(categoriaDaVenda(base).categoria).toBe("espontanea");
  });
  test("interação vence recompra", () => {
    const r = categoriaDaVenda({
      ...base,
      mensagemEquipeEm: horasAntes(3),
      tinhaVendaAnterior: true,
    });
    expect(r.categoria).toBe("atendimento");
  });
});

describe("comissaoDaVenda", () => {
  test("follow-up e atendimento pagam, arredondando a 2 casas", () => {
    expect(comissaoDaVenda(360, 10, "follow-up")).toBe(36);
    expect(comissaoDaVenda(333.33, 7.5, "atendimento")).toBe(25);
    expect(comissaoDaVenda(100.05, 10, "atendimento")).toBe(10.01);
  });
  test("meio centavo arredonda para cima", () => {
    expect(comissaoDaVenda(1.16, 12.5, "follow-up")).toBe(0.15);
    expect(comissaoDaVenda(2.28, 12.5, "follow-up")).toBe(0.29);
  });
  test("recompra e espontânea valem 0", () => {
    expect(comissaoDaVenda(360, 10, "recompra")).toBe(0);
    expect(comissaoDaVenda(360, 10, "espontanea")).toBe(0);
  });
});
