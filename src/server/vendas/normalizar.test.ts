import { describe, expect, test } from "bun:test";

import { normalizarVenda } from "./normalizar";

function ok(corpo: unknown) {
  const r = normalizarVenda(corpo);
  if ("erro" in r) throw new Error(r.erro);
  if ("ignorar" in r) throw new Error(`ignorado: ${r.ignorar}`);
  return r;
}

describe("normalizarVenda", () => {
  test("campos principais", () => {
    const r = ok({
      id: 123,
      created_at: "2026-11-10T12:00:00Z",
      amount: 360.5,
      cpf: "123.456.789-09",
      phone: "(11) 98888-7777",
      product: "Pacote 4h",
      status: "paga",
    });
    expect(r).toMatchObject({
      idExterno: "123",
      compradaEm: "2026-11-10T12:00:00.000Z",
      valor: 360.5,
      cpf: "12345678909",
      telefone: "+5511988887777",
      produto: "Pacote 4h",
      horas: 4,
      status: "paga",
    });
  });

  test("nomes alternativos e aninhados", () => {
    const r = ok({
      order_id: "A1",
      paid_at: "2026-11-10T09:00:00-03:00",
      valor: "720,00",
      buyer: { document: "12345678909", phone: "11988887777" },
      plano: "x",
      produto: "Plano",
      horas: "8",
    });
    expect(r.idExterno).toBe("A1");
    expect(r.compradaEm).toBe("2026-11-10T12:00:00.000Z");
    expect(r.valor).toBe(720);
    expect(r.cpf).toBe("12345678909");
    expect(r.telefone).toBe("+5511988887777");
    expect(r.horas).toBe(8);
  });

  test("inteiro > 1000 vira centavos, com decisão", () => {
    const r = ok({ id: 1, amount: 36000 });
    expect(r.valor).toBe(360);
    expect(r.decisoes.join(" ")).toContain("valor em centavos: 36000 → 360.00");
  });

  test("inteiro pequeno e decimal ficam em reais", () => {
    expect(ok({ id: 1, amount: 360 }).valor).toBe(360);
    expect(ok({ id: 1, amount: "1500.50" }).valor).toBe(1500.5);
  });

  test("status de estorno", () => {
    for (const s of ["refunded", "chargeback", "Estornada", "cancelled"]) {
      expect(ok({ id: 1, amount: 10, status: s }).status).toBe("estornada");
    }
    expect(ok({ id: 1, amount: 10, status: "approved" }).status).toBe("paga");
    expect(ok({ id: 1, amount: 10 }).status).toBe("paga");
  });

  test("ausentes viram null; cpf inválido vira null", () => {
    const r = ok({ id: 1, amount: 10, cpf: "123" });
    expect(r.cpf).toBeNull();
    expect(r.telefone).toBeNull();
    expect(r.produto).toBeNull();
    expect(r.horas).toBeNull();
  });

  test("data ausente usa agora, com decisão", () => {
    const r = ok({ id: 1, amount: 10 });
    expect(Number.isNaN(Date.parse(r.compradaEm))).toBe(false);
    expect(r.decisoes.join(" ")).toContain("data");
  });

  test("sem id ou sem valor: erro", () => {
    expect(normalizarVenda({ amount: 10 })).toEqual({
      erro: "formato desconhecido: sem id da venda",
    });
    expect(normalizarVenda({ id: 1 })).toEqual({ erro: "formato desconhecido: sem valor" });
    expect(normalizarVenda("x")).toEqual({ erro: "formato desconhecido: corpo não é objeto" });
  });

  test("status: aprovados, estornos, desconhecido e ausente", () => {
    for (const st of ["pago", "Aprovada", "approved", "paid", "completed", "confirmed", "paga"]) {
      expect(ok({ id: 1, amount: 10, status: st }).status).toBe("paga");
    }
    for (const st of ["pending", "refused", "waiting_payment", "abandoned", "expired"]) {
      expect(normalizarVenda({ id: 1, amount: 10, status: st })).toEqual({
        erro: `status "${st}" não reconhecido`,
      });
    }
    const r = ok({ id: 1, amount: 10 });
    expect(r.status).toBe("paga");
    expect(r.decisoes.join(" ")).toContain("status ausente");
  });

  test("ponto com três dígitos finais é milhar, não centavos", () => {
    for (const v of ["1.500", "R$ 1.500"]) {
      const r = ok({ id: 1, amount: v });
      expect(r.valor).toBe(1500);
      expect(r.decisoes.join(" ")).toContain("milhar");
    }
  });

  test("valor <= 0 é erro", () => {
    expect("erro" in normalizarVenda({ id: 1, amount: 0 })).toBe(true);
    expect("erro" in normalizarVenda({ id: 1, amount: -5 })).toBe(true);
  });
});

describe("envelope do app", () => {
  const pago = (data: Record<string, unknown> = {}) => ({
    event: "USER_HOUR_PURCHASE_PAID",
    timestamp: "2026-11-05T04:39:57.985Z",
    data: {
      transaction_id: "AB12CD3",
      payment_id: "pay_1",
      cpf: "123.456.789-09",
      phone: "11988887777",
      hours: 5,
      price_paid: 500,
      hour_type: "normal",
      ...data,
    },
  });

  test("PAID vira venda, valor em reais", () => {
    expect(ok(pago())).toEqual({
      idExterno: "AB12CD3",
      compradaEm: "2026-11-05T04:39:57.985Z",
      valor: 500,
      cpf: "12345678909",
      telefone: "+5511988887777",
      produto: "5h normal",
      horas: 5,
      status: "paga",
      decisoes: [
        "envelope do app (USER_HOUR_PURCHASE_PAID): price_paid em reais",
        "telefone sem código do país: assumido +55",
      ],
    });
  });

  test("package_label vence e payment_id substitui transaction_id", () => {
    const r = ok(pago({ transaction_id: undefined, package_label: "Pacote 5h" }));
    expect(r).toMatchObject({ idExterno: "pay_1", produto: "Pacote 5h" });
  });

  test("teste do app é ignorado", () => {
    expect(normalizarVenda(pago({ test: true }))).toEqual({ ignorar: "evento de teste do app" });
  });

  test("outros eventos são ignorados", () => {
    for (const event of ["USER_CREATE_ACCOUNT", "USER_HOUR_BOOKED", "USER_CONTRACT_SIGNED"]) {
      expect(normalizarVenda({ event, timestamp: "x", data: { booking_id: "1" } })).toEqual({
        ignorar: `evento ${event} sem venda`,
      });
    }
  });

  test("PAID sem id ou sem valor é erro", () => {
    expect(normalizarVenda(pago({ transaction_id: undefined, payment_id: undefined }))).toEqual({
      erro: "formato desconhecido: sem id da venda",
    });
    expect(normalizarVenda(pago({ price_paid: undefined }))).toEqual({
      erro: "formato desconhecido: sem valor",
    });
  });
});
