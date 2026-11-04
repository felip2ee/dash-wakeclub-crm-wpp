// Peças puras e chave de cache da tabela de usuários, usadas por /configuracoes e /equipe.

/** Mesma chave nas duas telas: salvar em uma atualiza a outra. */
export const CHAVE_PAINEL_ADMIN = ["admin", "painel"] as const;

/** Soma do peso de quem está ativo: o divisor do rateio de leads novos. */
export function totalPesoAtivo(atendentes: { ativo: boolean; peso: number }[]): number {
  return atendentes.reduce((total, a) => (a.ativo ? total + a.peso : total), 0);
}

export type PesoComissaoValidado =
  | { ok: true; peso: number; comissaoPct: number }
  | { ok: false; erro: string };

// Espelha o Zod de alterarPesoComissao/criarAtendente. Campo vazio não pode virar 0:
// Number("") é 0, e peso 0 tira a atendente do rodízio.
export function validarPesoComissao(peso: string, comissao: string): PesoComissaoValidado {
  const p = peso.trim() === "" ? NaN : Number(peso.trim());
  if (!Number.isInteger(p) || p < 0 || p > 10) {
    return { ok: false, erro: "Peso: um número inteiro de 0 a 10." };
  }
  const c = comissao.trim() === "" ? NaN : Number(comissao.trim().replace(",", "."));
  if (!Number.isFinite(c) || c < 0 || c > 100) {
    return { ok: false, erro: "Comissão: um número de 0 a 100." };
  }
  return { ok: true, peso: p, comissaoPct: c };
}
