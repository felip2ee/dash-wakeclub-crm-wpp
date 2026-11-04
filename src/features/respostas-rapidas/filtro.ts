export type RespostaRapida = { id: string; atalho: string; texto: string; ativo: boolean };

const MAXIMO = 8;

/** Texto digitado começando com `/` abre a lista; o resto é prefixo do atalho. */
export function filtrarPorAtalho(lista: RespostaRapida[], digitado: string): RespostaRapida[] {
  if (!digitado.startsWith("/")) return [];
  const prefixo = digitado.slice(1).toLowerCase();
  return lista.filter((r) => r.atalho.startsWith(prefixo)).slice(0, MAXIMO);
}
