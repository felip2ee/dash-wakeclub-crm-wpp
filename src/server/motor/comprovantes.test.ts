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
  e2e: "E123",
  legivel: true,
};
const CTX = { config: CONFIG, agora: AGORA, vendaAppParecida: false, leadComDono: true };

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
        e2e: " e123 abc ",
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
      e2e: "E123ABC",
    });
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
