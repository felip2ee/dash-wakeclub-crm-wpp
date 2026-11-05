// Texto da variação contra o período anterior (Visão geral comercial).
export function textoVariacao(atual: number, anterior: number): string {
  if (anterior === 0) return atual === 0 ? "igual ao período anterior" : "antes: 0";
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  if (pct === 0) return "igual ao período anterior";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% vs. período anterior`;
}
