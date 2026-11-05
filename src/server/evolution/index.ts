/**
 * Ponto único de acesso ao adaptador da Evolution API 2.3.7.
 *
 * Só existe com `EVOLUTION_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCIA` definidas.
 * Sem elas não há adaptador: o webhook só grava bruto, o motor não processa eventos da
 * Evolution e o envio pelo app fica indisponível. Nada é simulado.
 */
import { criarAdaptadorEvolution } from "./api";
import type { AdaptadorEvolution } from "./tipos";

let memo: AdaptadorEvolution | null | undefined;

export function obterAdaptador(): AdaptadorEvolution | null {
  if (memo !== undefined) return memo;
  const {
    EVOLUTION_URL: url,
    EVOLUTION_API_KEY: apiKey,
    EVOLUTION_INSTANCIA: instancia,
  } = process.env;
  memo = url && apiKey && instancia ? criarAdaptadorEvolution({ url, apiKey, instancia }) : null;
  return memo;
}

/**
 * Chave de ordem do evento bruto. Sem adaptador não dá para extrair a conversa,
 * então tudo vai numa chave só: em sequência, mais lento, nunca fora de ordem.
 */
export function chaveDeOrdemEvolution(corpo: unknown): string | null {
  return obterAdaptador()?.chaveDeOrdem(corpo) ?? "evolution";
}
