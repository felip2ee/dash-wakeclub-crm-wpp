/**
 * Percentuais com uma casa que somam exatamente 100,0 (método do maior resto): arredondar
 * cada um sozinho faria as pílulas de "Vendas por categoria" somarem 99,9 ou 100,1.
 */
export function percentuaisPorMaiorResto(valores: number[]): number[] {
  const total = valores.reduce((t, v) => t + v, 0);
  if (total <= 0) return valores.map(() => 0);
  // Em décimos de ponto percentual: 1000 = 100,0%.
  const brutos = valores.map((v) => (v / total) * 1000);
  const partes = brutos.map(Math.floor);
  let falta = 1000 - partes.reduce((t, p) => t + p, 0);
  // `sort` é estável: no empate, a sobra vai para quem vem primeiro.
  const porResto = brutos.map((b, i) => ({ i, resto: b - partes[i] }));
  for (const { i } of porResto.sort((a, b) => b.resto - a.resto)) {
    if (falta-- <= 0) break;
    partes[i]++;
  }
  return partes.map((p) => p / 10);
}

/** 38.6 → "38,6%" */
export const textoPercentual = (p: number) =>
  `${p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
