import { describe, expect, test } from "bun:test";

import { escolherPorPeso, type Vendedor, vendedorMencionado } from "./distribuicao";

const v = (id: string, nome: string, peso = 1, extra: Partial<Vendedor> = {}): Vendedor => ({
  id,
  nome,
  peso,
  recebidos30d: 0,
  cargaAtiva: 0,
  ...extra,
});

describe("escolha por peso", () => {
  test("peso 2 recebe o dobro", () => {
    const equipe = [v("a", "Ana", 2), v("b", "Bia", 1)];
    const contagem: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 30; i++) {
      const id = escolherPorPeso(equipe, () => 0);
      if (!id) throw new Error("sem vendedor");
      contagem[id] += 1;
      const escolhido = equipe.find((x) => x.id === id);
      if (escolhido) escolhido.recebidos30d += 1;
    }
    expect(contagem).toEqual({ a: 20, b: 10 });
  });

  test("peso 0 nao recebe", () => {
    expect(escolherPorPeso([v("a", "Ana", 0), v("b", "Bia", 1, { recebidos30d: 50 })])).toBe("b");
    expect(escolherPorPeso([v("a", "Ana", 0)])).toBeNull();
    expect(escolherPorPeso([])).toBeNull();
  });

  test("empate vai para menor carga", () => {
    const equipe = [v("a", "Ana", 1, { cargaAtiva: 5 }), v("b", "Bia", 1, { cargaAtiva: 2 })];
    expect(escolherPorPeso(equipe, () => 0)).toBe("b");
  });

  test("quem ficou fora volta e recebe ate equilibrar", () => {
    const equipe = [v("a", "Ana", 1, { recebidos30d: 10 }), v("b", "Bia", 1, { recebidos30d: 3 })];
    expect(escolherPorPeso(equipe)).toBe("b");
  });
});

describe("menção ao vendedor", () => {
  const equipe = [v("t", "Tâmara Silva"), v("j", "João Pedro"), v("p", "Paula", 0)];

  test("mencao sem acento e palavra inteira", () => {
    expect(vendedorMencionado("quero comprar com a tamara", equipe)).toBe("t");
    expect(vendedorMencionado("O JOÃO me atendeu ontem", equipe)).toBe("j");
    expect(vendedorMencionado("moro em tamaraíba", equipe)).toBeNull();
  });

  test("mencao ambigua ou pausada", () => {
    const comHomonimo = [...equipe, v("t2", "Tamara Souza")];
    expect(vendedorMencionado("quero com a Tâmara", comHomonimo)).toBeNull();
    expect(vendedorMencionado("a paula me indicou", equipe)).toBeNull();
    expect(vendedorMencionado("falei com a tamara e com o joao", equipe)).toBeNull();
  });
});
