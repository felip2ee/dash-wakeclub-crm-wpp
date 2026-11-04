import { describe, expect, test } from "bun:test";

import { agruparPorEtapa, ETAPAS, precoHoraDe } from "./pipeline";

const card = (id: string, etiqueta: string, valorCheio: number, valorEsperado: number) => ({
  id,
  etiqueta,
  valorCheio,
  valorEsperado,
});

describe("agruparPorEtapa", () => {
  test("devolve as oito etapas na ordem do CRM, mesmo vazias", () => {
    const { colunas } = agruparPorEtapa([]);
    expect(colunas.map((c) => c.etapa)).toEqual([...ETAPAS]);
    expect(ETAPAS[0]).toBe("Novo Lead");
    expect(ETAPAS[7]).toBe("Negociação encerrada");
    expect(colunas.every((c) => c.quantidade === 0 && c.valorCheio === 0)).toBe(true);
  });

  test("soma quantidade, valor cheio e esperado por etapa, em centavos", () => {
    const { colunas } = agruparPorEtapa([
      card("a", "Atendimento", 1440, 172.8),
      card("b", "Atendimento", 360, 0.1),
      card("c", "Atendimento", 360, 0.2),
      card("d", "Link enviado", 720, 144),
    ]);
    const atendimento = colunas.find((c) => c.etapa === "Atendimento");
    expect(atendimento?.quantidade).toBe(3);
    expect(atendimento?.valorCheio).toBe(2160);
    expect(atendimento?.valorEsperado).toBe(173.1);
    expect(atendimento?.cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(colunas.find((c) => c.etapa === "Link enviado")?.quantidade).toBe(1);
  });

  test("totais contam só leads ativos (valor esperado > 0) e a probabilidade é esperado/cheio", () => {
    const { totais } = agruparPorEtapa([
      card("a", "Atendimento", 1000, 250),
      card("b", "Aguardando pagamento", 1000, 700),
      // Fora do pipeline: valor esperado 0 (encerrado, opt-out, sem atendimento).
      card("c", "Negociação encerrada", 5000, 0),
    ]);
    expect(totais).toEqual({
      leadsAtivos: 2,
      valorCheio: 2000,
      valorEsperado: 950,
      probabilidade: 48,
    });
  });

  test("sem leads ativos a probabilidade é 0, não NaN", () => {
    expect(agruparPorEtapa([card("a", "Aula realizada", 360, 0)]).totais.probabilidade).toBe(0);
  });

  test("etiqueta fora das etapas do CRM não entra em coluna nem nos totais", () => {
    const { colunas, totais } = agruparPorEtapa([card("a", "Etapa nova", 360, 18)]);
    expect(colunas.reduce((n, c) => n + c.quantidade, 0)).toBe(0);
    expect(totais.leadsAtivos).toBe(0);
  });
});

describe("precoHoraDe", () => {
  test("devolve o preço da hora como número", () => {
    expect(precoHoraDe({ preco_hora: "360" })).toBe(360);
    expect(precoHoraDe({ preco_hora: "412.5" })).toBe(412.5);
  });

  test("sem configuração ou valor não numérico lança, em vez de zerar a tela", () => {
    const erro = "Preço da hora não configurado. Defina em Configurações.";
    expect(() => precoHoraDe(undefined)).toThrow(erro);
    expect(() => precoHoraDe({ preco_hora: null })).toThrow(erro);
    expect(() => precoHoraDe({ preco_hora: "abc" })).toThrow(erro);
    expect(() => precoHoraDe({ preco_hora: "" })).toThrow(erro);
  });
});
