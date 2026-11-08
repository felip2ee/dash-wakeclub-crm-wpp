import { describe, expect, test } from "bun:test";

import { type ConfigPix, decidir, type Leitura, normalizarLeitura } from "./comprovantes";

const AGORA = new Date("2026-11-08T15:00:00-03:00");
const CONFIG: ConfigPix = {
  chave: "pix@wake.club",
  cnpj: "12.345.678/0001-90",
  precos: { 1: 400, 2: 720, 4: 1300 },
};
const LEITURA: Leitura = {
  ehComprovante: true,
  valor: 720,
  pagoEm: "2026-11-08T14:00:00-03:00",
  pagador: "Fulano",
  recebedor: "Wake Club",
  chaveRecebedor: "PIX@wake.club",
  cnpjRecebedor: null,
  e2e: "E12345678202611081400ABCDEFGHIJK",
  legivel: true,
};
const CTX = {
  config: CONFIG,
  agora: AGORA,
  vendaAppParecida: false,
  comprovanteParecido: false,
  leadComDono: true,
};

const motivo = (l: Partial<Leitura>, horas: number | null = 2, ctx: Partial<typeof CTX> = {}) => {
  const d = decidir({ ...LEITURA, ...l }, horas, { ...CTX, ...ctx });
  return d.acao === "confirmar" ? d.motivo : d;
};

describe("decidir", () => {
  test("tudo confere: registra o pacote", () => {
    expect(decidir(LEITURA, 2, CTX)).toEqual({ acao: "registrar", horas: 2 });
  });

  test("CNPJ lido com outra máscara confere", () => {
    expect(
      decidir({ ...LEITURA, chaveRecebedor: null, cnpjRecebedor: "12345678000190" }, 2, CTX),
    ).toEqual({ acao: "registrar", horas: 2 });
  });

  test("sem chave/CNPJ ou com preço vazio: configurar", () => {
    const c = "configure a chave Pix e os preços dos pacotes";
    expect(motivo({}, 2, { config: { ...CONFIG, chave: null, cnpj: null } })).toBe(c);
    expect(motivo({}, 2, { config: { ...CONFIG, precos: { 1: 400, 2: 720, 4: null } } })).toBe(c);
  });

  test("ilegível", () => {
    const c = "comprovante ilegível";
    expect(motivo({ legivel: false })).toBe(c);
    expect(motivo({ valor: null })).toBe(c);
    expect(motivo({ pagoEm: "2026-11-10T10:00:00-03:00" })).toBe(c); // no futuro
    expect(motivo({ pagoEm: null })).toBe(c); // data não lida não vira a hora da mensagem
  });

  test("chave e CNPJ comparados conforme o tipo", () => {
    const nao = "recebedor não confere com a chave/CNPJ da Wake";
    const so = (chave: string | null, cnpj: string | null) => ({ ...CONFIG, chave, cnpj });
    const lido = (chaveRecebedor: string | null, cnpjRecebedor: string | null = null) => ({
      chaveRecebedor,
      cnpjRecebedor,
    });
    // E-mail: ponto e @ contam.
    expect(motivo(lido("a.b@x.com"), 2, { config: so("ab@x.com", null) })).toBe(nao);
    // CNPJ mascarado não basta.
    expect(motivo(lido(null, "12.***.***/0001-**"), 2, { config: so(null, CONFIG.cnpj) })).toBe(
      nao,
    );
    expect(
      motivo(lido(null, "12.345.678/0001-90"), 2, { config: so(null, "12345678000190") }),
    ).toEqual({ acao: "registrar", horas: 2 });
    // Telefone: só dígitos.
    expect(motivo(lido("+55 63 98111-9636"), 2, { config: so("5563981119636", null) })).toEqual({
      acao: "registrar",
      horas: 2,
    });
    // Chave aleatória: exata, sem caixa.
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(motivo(lido(uuid.toUpperCase()), 2, { config: so(uuid, null) })).toEqual({
      acao: "registrar",
      horas: 2,
    });
    expect(motivo(lido("123e4567e89b12d3a456426614174000"), 2, { config: so(uuid, null) })).toBe(
      nao,
    );
    // CNPJ lido no campo da chave também confere.
    expect(motivo(lido("12345678000190"), 2, { config: so(null, CONFIG.cnpj) })).toEqual({
      acao: "registrar",
      horas: 2,
    });
  });

  test("recebedor de outra conta", () => {
    expect(motivo({ chaveRecebedor: "outra@conta.com", cnpjRecebedor: "99999999000199" })).toBe(
      "recebedor não confere com a chave/CNPJ da Wake",
    );
    expect(motivo({ chaveRecebedor: null })).toBe("recebedor não confere com a chave/CNPJ da Wake");
  });

  test("valor fora da tabela ou em dois pacotes", () => {
    expect(motivo({ valor: 700 })).toBe("valor R$ 700,00 não bate com nenhum pacote");
    const iguais = { ...CONFIG, precos: { 1: 720, 2: 720, 4: 1300 } };
    expect(motivo({}, 2, { config: iguais })).toBe("valor R$ 720,00 não bate com nenhum pacote");
  });

  test("horas da conversa diferentes", () => {
    expect(motivo({}, 4)).toBe("horas da conversa (4 h) não batem com o valor");
    expect(motivo({}, null)).toBe("horas da conversa (? h) não batem com o valor");
  });

  test("pagamento antigo", () => {
    expect(motivo({ pagoEm: "2026-11-05T14:00:00-03:00" })).toBe("pagamento de mais de 3 dias");
  });

  test("venda do app parecida", () => {
    expect(motivo({}, 2, { vendaAppParecida: true })).toBe(
      "possível venda repetida com venda do app",
    );
  });

  test("outro comprovante parecido com E2E diferente", () => {
    expect(motivo({}, 2, { comprovanteParecido: true })).toBe("possível comprovante repetido");
  });

  test("lead sem dono", () => {
    expect(motivo({}, 2, { leadComDono: false })).toBe("lead sem dono");
  });
});

describe("normalizarLeitura", () => {
  test("converte a resposta da IA", () => {
    expect(
      normalizarLeitura({
        eh_comprovante: true,
        legivel: true,
        valor: 720.004,
        pago_em: "2026-11-08 14:32",
        pagador: " Fulano ",
        recebedor: "",
        chave_recebedor: "pix@wake.club",
        cnpj_recebedor: null,
        e2e: " e1234567 8202611081432abcdefghijk ",
      }),
    ).toEqual({
      ehComprovante: true,
      legivel: true,
      valor: 720,
      pagoEm: "2026-11-08T17:32:00.000Z",
      pagador: "Fulano",
      recebedor: null,
      chaveRecebedor: "pix@wake.club",
      cnpjRecebedor: null,
      e2e: "E12345678202611081432ABCDEFGHIJK",
    });
  });

  test("E2E fora do formato vira null", () => {
    const e2e = (x: unknown) => normalizarLeitura({ eh_comprovante: true, e2e: x }).e2e;
    expect(e2e("E123ABC")).toBeNull();
    expect(e2e("X12345678202611081432ABCDEFGHIJK")).toBeNull();
    expect(e2e("E12345678202611081432ABCDEFGHIJKL")).toBeNull(); // 33
    expect(e2e("E12345678-202611081432ABCDEFGHIJ")).toBeNull();
  });

  test("data também em DD/MM/YYYY HH:MM, em Brasília", () => {
    const pago = (x: unknown) => normalizarLeitura({ eh_comprovante: true, pago_em: x }).pagoEm;
    expect(pago("08/11/2026 14:32")).toBe("2026-11-08T17:32:00.000Z");
    expect(pago("08/11/2026 14:32:10")).toBe("2026-11-08T17:32:10.000Z");
    expect(pago("8/11/2026 14:32")).toBeNull();
    expect(pago("31/02/2026 14:32")).toBeNull();
    expect(pago("2026-02-31 14:32")).toBeNull();
  });

  test("resposta estranha vira leitura vazia que não é comprovante", () => {
    const l = normalizarLeitura("nada");
    expect(l.ehComprovante).toBe(false);
    expect(normalizarLeitura({ eh_comprovante: true, valor: -5, pago_em: "ontem" })).toMatchObject({
      valor: null,
      pagoEm: null,
      legivel: false,
    });
  });
});
