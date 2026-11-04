/**
 * Adaptador de log do servidor: uma linha JSON por evento, para o log do contêiner.
 * Nunca passe texto de conversa, telefone, senha, token ou segredo em `extra`.
 */
type Extra = Record<string, string | number | boolean | null>;

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export function logErro(evento: string, erro: unknown, extra: Extra = {}): void {
  console.error(JSON.stringify({ nivel: "erro", evento, mensagem: mensagemDe(erro), ...extra }));
}

export function logInfo(evento: string, extra: Extra = {}): void {
  console.info(JSON.stringify({ nivel: "info", evento, ...extra }));
}
