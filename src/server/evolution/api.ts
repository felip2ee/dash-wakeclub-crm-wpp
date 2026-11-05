/**
 * Adaptador da Evolution API 2.3.7 (não o Evolution Go): junta a leitura dos webhooks
 * (`normalizar.ts`) com a API REST para enviar, baixar mídia e consultar a conexão.
 *
 * Rotas e corpos seguem o código-fonte da 2.3.7 (github.com/EvolutionAPI/evolution-api,
 * tag 2.3.7: `src/api/dto/sendMessage.dto.ts`, `src/validate/message.schema.ts`,
 * `src/api/routes/sendMessage.router.ts`, `src/api/routes/chat.router.ts`,
 * `src/api/controllers/instance.controller.ts`). A chave vai só no header `apikey` e
 * nunca entra em mensagem de erro.
 */
import { chaveDeOrdemDoCorpo, normalizarEvolution, type Obj, obj, str } from "./normalizar";
import { type AdaptadorEvolution, type EstadoConexao, type Envio, ErroEnvio } from "./tipos";

export type ConfigEvolution = {
  url: string;
  apiKey: string;
  instancia: string;
  /** Injetável para teste; padrão é o `fetch` global. */
  fetch?: typeof fetch;
};

// Bem abaixo dos 15 min do órfão em `enviando` (envio-followups.ts).
const TIMEOUT_TEXTO_MS = 30_000;
const TIMEOUT_MIDIA_MS = 120_000;
const TIMEOUT_ESTADO_MS = 15_000;

/** Rota, corpo e timeout de cada tipo de envio; `number` só em dígitos, sem `+`. */
function pedidoDeEnvio(envio: Envio): { rota: string; corpo: Obj; timeout: number } {
  const number = envio.telefone.replace(/\D/g, "");
  let rota: string;
  let corpo: Obj;
  if (envio.tipo === "texto") {
    rota = "message/sendText";
    corpo = { number, text: envio.texto };
  } else if (envio.tipo === "localizacao") {
    // `name` e `address` são obrigatórios no schema da 2.3.7 (podem ser vazios).
    rota = "message/sendLocation";
    corpo = {
      number,
      latitude: envio.latitude,
      longitude: envio.longitude,
      name: envio.nome ?? "",
      address: "",
    };
  } else if (envio.tipo === "audio") {
    // Mensagem de voz (PTT): a Evolution converte para OGG/Opus.
    rota = "message/sendWhatsAppAudio";
    corpo = { number, audio: envio.base64 };
  } else {
    rota = "message/sendMedia";
    const mediatype = { imagem: "image", video: "video", documento: "document" }[envio.tipo];
    corpo = {
      number,
      mediatype,
      mimetype: envio.mime,
      media: envio.base64,
      ...(envio.nomeArquivo ? { fileName: envio.nomeArquivo } : {}),
      ...(envio.legenda ? { caption: envio.legenda } : {}),
    };
  }
  const timeout =
    envio.tipo === "texto" || envio.tipo === "localizacao" ? TIMEOUT_TEXTO_MS : TIMEOUT_MIDIA_MS;
  return { rota, corpo, timeout };
}

export function criarAdaptadorEvolution(cfg: ConfigEvolution): AdaptadorEvolution {
  const base = cfg.url.replace(/\/+$/, "");
  const instancia = encodeURIComponent(cfg.instancia);
  const f = cfg.fetch ?? fetch;

  const chamar = (metodo: "GET" | "POST", rota: string, timeoutMs: number, corpo?: unknown) =>
    f(`${base}/${rota}/${instancia}`, {
      method: metodo,
      headers: { apikey: cfg.apiKey, "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(timeoutMs),
    });

  async function enviar(envio: Envio): Promise<{ evolutionMsgId: string }> {
    const { rota, corpo, timeout } = pedidoDeEnvio(envio);

    let r: Response;
    try {
      r = await chamar("POST", rota, timeout, corpo);
    } catch {
      // Timeout ou queda de rede: o pedido pode ter chegado. Nunca a mensagem crua (URL).
      throw new ErroEnvio(`Evolution sem resposta em ${rota}`, "incerto");
    }
    // 4xx (exceto 408): recusa da própria Evolution antes de falar com o WhatsApp
    // (número inválido, chave errada, instância inexistente, corpo inválido).
    if (r.status >= 400 && r.status < 500 && r.status !== 408)
      throw new ErroEnvio(`Evolution recusou ${rota} (${r.status})`, "nao_saiu");
    if (!r.ok) throw new ErroEnvio(`Evolution respondeu ${r.status} em ${rota}`, "incerto");
    let id = "";
    try {
      id = str(obj(obj(await r.json()).key).id);
    } catch {
      // cai no erro abaixo
    }
    if (!id) throw new ErroEnvio(`Evolution respondeu sem id em ${rota}`, "incerto");
    return { evolutionMsgId: id };
  }

  /** Para leitura (mídia, estado): erro de rede vira mensagem própria, sem a URL. */
  const chamarOuFalhar = async (...args: Parameters<typeof chamar>) => {
    try {
      return await chamar(...args);
    } catch {
      throw new Error(`Evolution sem resposta em ${args[1]}`);
    }
  };

  async function baixarMidia(evolutionMsgId: string) {
    const r = await chamarOuFalhar("POST", "chat/getBase64FromMediaMessage", TIMEOUT_MIDIA_MS, {
      message: { key: { id: evolutionMsgId } },
      convertToMp4: false,
    });
    // 400/404: a Evolution não achou a mensagem ou a mídia (expirada); repetir não adianta.
    if (r.status === 400 || r.status === 404) return null;
    if (!r.ok) throw new Error(`Evolution respondeu ${r.status} ao baixar mídia`);
    const j = obj(await r.json().catch(() => null));
    const base64 = str(j.base64);
    if (!base64) return null;
    const mime = str(j.mimetype).split(";")[0].trim() || "application/octet-stream";
    return { mime, dados: new Uint8Array(Buffer.from(base64, "base64")) };
  }

  async function estadoConexao(): Promise<EstadoConexao> {
    const r = await chamarOuFalhar("GET", "instance/connectionState", TIMEOUT_ESTADO_MS);
    if (!r.ok) throw new Error(`Evolution respondeu ${r.status} ao consultar a conexão`);
    const j = obj(await r.json().catch(() => null));
    const estado = str(obj(j.instance).state) || str(j.state);
    if (estado === "open" || estado === "connecting" || estado === "close") return estado;
    throw new Error("Evolution devolveu estado de conexão desconhecido");
  }

  return {
    chaveDeOrdem: chaveDeOrdemDoCorpo,
    normalizar: normalizarEvolution,
    enviar,
    baixarMidia,
    estadoConexao,
  };
}
