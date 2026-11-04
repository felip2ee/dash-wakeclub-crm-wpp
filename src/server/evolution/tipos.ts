/**
 * Contrato entre o motor e a Evolution Go.
 *
 * O formato dos webhooks e das rotas do Evolution Go só será conhecido pelos corpos
 * reais capturados (design §4.3: não chutar pela documentação). Por isso o resto do
 * sistema só conhece estes tipos normalizados; a tradução mora num adaptador isolado.
 */

export type TipoMidia =
  | "texto"
  | "imagem"
  | "video"
  | "documento"
  | "audio"
  | "figurinha"
  | "contato"
  | "localizacao";

export type EventoMensagem = {
  tipo: "mensagem";
  /** E.164 com o 9º dígito; o adaptador já resolveu `@lid` pelo número real. */
  telefone: string;
  nome: string | null;
  daEquipe: boolean;
  texto: string;
  tipoMidia: TipoMidia;
  enviadaEm: string;
  evolutionMsgId: string;
};

export type EventoAck = { tipo: "ack"; evolutionMsgId: string; nivel: 0 | 1 | 2 | 3 | 4 | 5 };

export type EventoConexao = {
  tipo: "conexao";
  instancia: string;
  evento: string;
  estado: "open" | "connecting" | "close" | null;
  statusReason: number | null;
  qrPendente: boolean;
  detalhe: Record<string, unknown>;
};

export type EventoNormalizado =
  | EventoMensagem
  | EventoAck
  | EventoConexao
  | { tipo: "ignorar"; motivo: string };

export type EnvioMidia = {
  tipo: "imagem" | "video" | "documento" | "audio";
  base64: string;
  mime: string;
  nomeArquivo?: string;
  legenda?: string;
};

export type Envio = { telefone: string } & (
  | { tipo: "texto"; texto: string }
  | EnvioMidia
  | { tipo: "localizacao"; latitude: number; longitude: number; nome?: string }
);

export type EstadoConexao = "open" | "connecting" | "close";

export interface AdaptadorEvolution {
  chaveDeOrdem(corpo: unknown): string | null;
  normalizar(corpo: unknown): EventoNormalizado[];
  enviar(envio: Envio): Promise<{ evolutionMsgId: string }>;
  baixarMidia(evolutionMsgId: string): Promise<{ mime: string; dados: Uint8Array } | null>;
  estadoConexao(): Promise<EstadoConexao>;
}

/**
 * Erro do `enviar`. O adaptador diz se tem certeza de que a mensagem não saiu (recusa antes
 * de chegar ao WhatsApp): só aí o motor tenta de novo. `incerto` (timeout, 5xx, resposta
 * ilegível) pode ter saído; o follow-up é abortado e o vendedor confere, nunca reenviado.
 */
export class ErroEnvio extends Error {
  constructor(
    mensagem: string,
    readonly certeza: "nao_saiu" | "incerto",
  ) {
    super(mensagem);
    this.name = "ErroEnvio";
  }
}
