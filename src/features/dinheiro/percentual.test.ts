import { describe, expect, test } from "bun:test";

import { percentuaisPorMaiorResto } from "./percentual";

const soma = (xs: number[]) => Math.round(xs.reduce((t, x) => t + x * 10, 0));

describe("percentuaisPorMaiorResto", () => {
  test("terços somam 100,0 e a sobra vai para o primeiro empate", () => {
    const p = percentuaisPorMaiorResto([1, 1, 1]);
    expect(p).toEqual([33.4, 33.3, 33.3]);
    expect(soma(p)).toBe(1000);
  });

  test("a sobra vai para os maiores restos", () => {
    // 72.4/187.6 = 38,59…; 54.8 = 29,21…; 37.2 = 19,82…; 23.2 = 12,36…
    const p = percentuaisPorMaiorResto([72400, 54800, 37200, 23200]);
    expect(p).toEqual([38.6, 29.2, 19.8, 12.4]);
    expect(soma(p)).toBe(1000);
  });

  test("valores exatos e zeros", () => {
    expect(percentuaisPorMaiorResto([1200, 0, 500, 0])).toEqual([70.6, 0, 29.4, 0]);
    expect(percentuaisPorMaiorResto([10])).toEqual([100]);
  });

  test("sem total, tudo zero", () => {
    expect(percentuaisPorMaiorResto([0, 0])).toEqual([0, 0]);
    expect(percentuaisPorMaiorResto([])).toEqual([]);
  });
});
