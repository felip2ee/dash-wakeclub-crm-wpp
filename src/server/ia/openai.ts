/**
 * Cliente da OpenAI por `fetch`, sem SDK (spec §2). Uma retentativa em 5xx, timeout
 * ou falha de rede, como o `max_retries` dos workflows legados. A chave vem só de
 * `OPENAI_API_KEY` e nunca entra em mensagem de erro.
 */
import type { ClienteIa } from "./tipos";

const BASE = "https://api.openai.com/v1";
const TIMEOUT_TRANSCRICAO_MS = 120_000;
const ESPERA_RETENTATIVA_MS = 500;

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export class ErroIa extends Error {
  /** Status HTTP da OpenAI; null em timeout, rede ou resposta ilegível. */
  readonly status: number | null;
  constructor(mensagem: string, status: number | null) {
    super(mensagem);
    this.name = "ErroIa";
    this.status = status;
  }
}

async function tentar(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs: number) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  let status: number;
  let texto: string;
  try {
    const res = await fetchFn(url, { ...init, signal: controle.signal });
    status = res.status;
    texto = await res.text();
  } catch (erro) {
    const motivo = controle.signal.aborted
      ? `sem resposta em ${timeoutMs} ms`
      : `falha de rede: ${erro instanceof Error ? erro.message : String(erro)}`;
    throw new ErroIa(`OpenAI ${motivo}`, null);
  } finally {
    clearTimeout(timer);
  }
  if (status < 200 || status >= 300) {
    // Só código e tipo: a mensagem da OpenAI ecoa a chave mascarada no 401 e vai para log
    // e `transcricao_erro`.
    let detalhe = "";
    try {
      const e = (JSON.parse(texto) as { error?: { code?: unknown; type?: unknown } }).error;
      detalhe = [e?.code, e?.type]
        .filter((v) => typeof v === "string" && v)
        .map((v) => String(v).slice(0, 60))
        .join(", ");
    } catch {
      // corpo que não é JSON: fica só o status
    }
    throw new ErroIa(`OpenAI respondeu ${status}${detalhe ? ` (${detalhe})` : ""}`, status);
  }
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new ErroIa("OpenAI devolveu corpo que não é JSON", status);
  }
}

async function pedir(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs: number) {
  try {
    return await tentar(fetchFn, url, init, timeoutMs);
  } catch (erro) {
    const transitorio = erro instanceof ErroIa && (erro.status === null || erro.status >= 500);
    if (!transitorio) throw erro;
    await new Promise((r) => setTimeout(r, ESPERA_RETENTATIVA_MS));
    return tentar(fetchFn, url, init, timeoutMs);
  }
}

/** Conteúdo do usuário: texto puro sem anexos; com anexos, partes de texto, imagem e PDF. */
function conteudoUsuario(p: Parameters<ClienteIa["chatJson"]>[0]) {
  if (!p.anexos?.length) return p.usuario;
  const partes: unknown[] = [{ type: "text", text: p.usuario }];
  for (const a of p.anexos) {
    const url = `data:${a.mime};base64,${Buffer.from(a.dados).toString("base64")}`;
    if (a.mime.startsWith("image/")) partes.push({ type: "image_url", image_url: { url } });
    else if (a.mime === "application/pdf")
      partes.push({ type: "file", file: { filename: a.nomeArquivo, file_data: url } });
    else throw new ErroIa("anexo não suportado", null);
  }
  return partes;
}

/** null sem `OPENAI_API_KEY`: as tarefas de IA não rodam. */
export function criarClienteOpenAi(fetchFn: FetchFn = fetch): ClienteIa | null {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) return null;
  const autorizacao = { authorization: `Bearer ${chave}` };

  return {
    async chatJson<T>(p: Parameters<ClienteIa["chatJson"]>[0]) {
      const corpo = (await pedir(
        fetchFn,
        `${BASE}/chat/completions`,
        {
          method: "POST",
          headers: { ...autorizacao, "content-type": "application/json" },
          body: JSON.stringify({
            model: p.modelo,
            messages: [
              { role: "system", content: p.sistema },
              { role: "user", content: conteudoUsuario(p) },
            ],
            reasoning_effort: p.reasoningEffort,
            response_format: {
              type: "json_schema",
              json_schema: { name: p.nomeSchema, schema: p.schema },
            },
          }),
        },
        p.timeoutMs,
      )) as { choices?: { message?: { content?: string | null } }[] };
      const conteudo = corpo.choices?.[0]?.message?.content;
      if (!conteudo) throw new ErroIa("OpenAI sem conteúdo na resposta", null);
      try {
        return JSON.parse(conteudo) as T;
      } catch {
        throw new ErroIa("OpenAI devolveu conteúdo que não é JSON", null);
      }
    },

    async transcrever(p) {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(p.dados)], { type: p.mime }), p.nomeArquivo);
      form.append("model", process.env.OPENAI_MODELO_TRANSCRICAO || "whisper-1");
      form.append("language", "pt");
      const corpo = (await pedir(
        fetchFn,
        `${BASE}/audio/transcriptions`,
        { method: "POST", headers: autorizacao, body: form },
        TIMEOUT_TRANSCRICAO_MS,
      )) as { text?: unknown };
      if (typeof corpo.text !== "string") throw new ErroIa("OpenAI sem texto na transcrição", null);
      return corpo.text;
    },
  };
}
