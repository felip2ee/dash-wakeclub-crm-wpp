/**
 * Contrato do cliente de IA. As tarefas do motor recebem um `ClienteIa` por
 * parâmetro: em produção o de `openai.ts`, nos testes o de `falso.ts`.
 */

export type PedidoChat = {
  modelo: string;
  sistema: string;
  usuario: string;
  schema: Record<string, unknown>;
  nomeSchema: string;
  reasoningEffort: "low" | "medium";
  timeoutMs: number;
};

export type PedidoTranscricao = { dados: Uint8Array; mime: string; nomeArquivo: string };

export type ClienteIa = {
  chatJson<T>(p: PedidoChat): Promise<T>;
  transcrever(p: PedidoTranscricao): Promise<string>;
};
