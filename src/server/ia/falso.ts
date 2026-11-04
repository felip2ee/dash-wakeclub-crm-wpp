/**
 * Cliente de IA falso para os testes: devolve as respostas preparadas, em ordem,
 * e registra cada chamada. Uma resposta que seja `Error` é lançada (simula falha
 * do modelo). Nenhum teste fala com a OpenAI.
 */
import type { ClienteIa, PedidoChat, PedidoTranscricao } from "./tipos";

export function clienteIaFalso(respostas: { chat?: unknown[]; transcricao?: string[] }) {
  const chat = [...(respostas.chat ?? [])];
  const transcricao = [...(respostas.transcricao ?? [])];
  const chamadas = { chat: [] as PedidoChat[], transcricao: [] as PedidoTranscricao[] };

  function proxima<T>(fila: unknown[], tipo: string): T {
    if (fila.length === 0) throw new Error(`clienteIaFalso: sem resposta de ${tipo} preparada`);
    const r = fila.shift();
    if (r instanceof Error) throw r;
    return r as T;
  }

  const cliente: ClienteIa & { chamadas: typeof chamadas } = {
    chamadas,
    async chatJson<T>(p: PedidoChat) {
      chamadas.chat.push(p);
      return proxima<T>(chat, "chat");
    },
    async transcrever(p: PedidoTranscricao) {
      chamadas.transcricao.push(p);
      return proxima<string>(transcricao, "transcrição");
    },
  };
  return cliente;
}
