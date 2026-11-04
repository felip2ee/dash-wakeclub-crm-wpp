/**
 * Ponto único de acesso ao adaptador da Evolution Go.
 *
 * Até os eventos reais serem capturados (plano da fase 1, Task 13), não há
 * adaptador: o webhook só grava bruto, o motor não processa eventos da Evolution e
 * o envio pelo app fica indisponível. Nada é simulado.
 */
import type { AdaptadorEvolution } from "./tipos";

export function obterAdaptador(): AdaptadorEvolution | null {
  return null;
}

/**
 * Chave de ordem do evento bruto. Sem adaptador não dá para extrair a conversa,
 * então tudo vai numa chave só: em sequência, mais lento, nunca fora de ordem.
 */
export function chaveDeOrdemEvolution(corpo: unknown): string | null {
  return obterAdaptador()?.chaveDeOrdem(corpo) ?? "evolution";
}
