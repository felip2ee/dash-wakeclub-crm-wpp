import { describe, expect, test } from "bun:test";

import { normalizarEventoApp } from "./eventos-app";

const ts = "2026-11-05T12:00:00.000Z";
const env = (event: string, data: Record<string, unknown>) => ({ event, timestamp: ts, data });
const pessoa = { user_id: "u1", cpf: "123.456.789-09", phone: "(11) 91234-5678", full_name: "Ana" };

describe("normalizarEventoApp", () => {
  test("cadastro", () => {
    const r = normalizarEventoApp(env("USER_CREATE_ACCOUNT", pessoa));
    expect(r).toMatchObject({
      tipo: "cadastro",
      chave: "u1",
      ocorridoEm: ts,
      pessoa: { userId: "u1", cpf: "12345678909", telefone: "+5511912345678", nome: "Ana" },
    });
  });

  test("agendamento", () => {
    const r = normalizarEventoApp(
      env("USER_HOUR_BOOKED", {
        ...pessoa,
        booking_id: "b1",
        date: "2026-11-10",
        time_slot: "14:00",
        modality: "wake",
      }),
    );
    expect(r).toMatchObject({
      tipo: "agendamento",
      chave: "b1",
      bookingId: "b1",
      modalidade: "wake",
    });
  });

  test("aula atendida; 14:00 SP = 17:00Z", () => {
    const r = normalizarEventoApp(
      env("USER_LESSON_ATTENDED", {
        ...pessoa,
        booking_id: "b1",
        date: "2026-11-10",
        time_slot: "14:00",
      }),
    );
    expect(r).toMatchObject({
      tipo: "aula",
      chave: "b1|2026-11-10|14:00",
      aulaEm: "2026-11-10T17:00:00.000Z",
      atendidaEm: ts,
    });
  });

  test("compra pendente", () => {
    const r = normalizarEventoApp(
      env("USER_HOUR_PURCHASE_CREATED", { ...pessoa, payment_id: "p1", hours: 10, price: 500 }),
    );
    expect(r).toMatchObject({
      tipo: "compra_pendente",
      chave: "p1",
      paymentId: "p1",
      horas: 10,
      valor: 500,
    });
  });

  test("compra paga usa transaction_id, senão payment_id", () => {
    expect(
      normalizarEventoApp(
        env("USER_HOUR_PURCHASE_PAID", {
          ...pessoa,
          transaction_id: "t1",
          payment_id: "p1",
          hours: 5,
        }),
      ),
    ).toMatchObject({ tipo: "compra_paga", chave: "t1", horas: 5 });
    expect(
      normalizarEventoApp(env("USER_HOUR_PURCHASE_PAID", { ...pessoa, payment_id: "p1" })),
    ).toMatchObject({ chave: "p1", horas: null });
  });

  test("teste, assinatura de contrato e desconhecido são ignorados", () => {
    expect(
      normalizarEventoApp(env("USER_CREATE_ACCOUNT", { ...pessoa, test: "true" })),
    ).toHaveProperty("ignorar");
    expect(
      normalizarEventoApp(env("USER_CREATE_ACCOUNT", { ...pessoa, test: true })),
    ).toHaveProperty("ignorar");
    expect(normalizarEventoApp(env("USER_CONTRACT_SIGNED", pessoa))).toHaveProperty("ignorar");
    expect(normalizarEventoApp(env("USER_XYZ", pessoa))).toHaveProperty("ignorar");
  });

  test("campo-chave ausente é erro", () => {
    expect(
      normalizarEventoApp(
        env("USER_HOUR_BOOKED", { ...pessoa, date: "2026-11-10", time_slot: "14:00" }),
      ),
    ).toEqual({ erro: "formato desconhecido: sem booking_id" });
    expect(normalizarEventoApp(env("USER_CREATE_ACCOUNT", {}))).toEqual({
      erro: "formato desconhecido: sem user_id",
    });
    expect(normalizarEventoApp("lixo")).toHaveProperty("erro");
  });
});
