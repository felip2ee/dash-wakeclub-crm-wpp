import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { anexoSuportado, criarClienteOpenAi, ErroIa } from "./openai";
import type { PedidoChat } from "./tipos";

type Chamada = { url: string; init: RequestInit };

function fetchFalso(respostas: Response[]) {
  const chamadas: Chamada[] = [];
  const fn = async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    const r = respostas.shift();
    if (!r) throw new Error("sem resposta preparada");
    return r;
  };
  return { fn, chamadas };
}

const ok = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });
const conteudo = (obj: unknown) => ok({ choices: [{ message: { content: JSON.stringify(obj) } }] });

const PEDIDO = {
  modelo: "gpt-5.4-mini",
  sistema: "sistema",
  usuario: "usuario",
  schema: { type: "object" },
  nomeSchema: "decisao",
  reasoningEffort: "low" as const,
  timeoutMs: 1000,
};

let chaveAntes: string | undefined;
beforeEach(() => {
  chaveAntes = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-teste";
});
afterEach(() => {
  if (chaveAntes === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = chaveAntes;
});

describe("cliente OpenAI", () => {
  test("sem chave devolve null", () => {
    delete process.env.OPENAI_API_KEY;
    expect(criarClienteOpenAi()).toBeNull();
  });

  test("chatJson monta o corpo e faz parse do conteúdo", async () => {
    const f = fetchFalso([conteudo({ enviar: true, motivo: "ok" })]);
    const ia = criarClienteOpenAi(f.fn);
    const r = await ia?.chatJson<{ enviar: boolean }>(PEDIDO);
    expect(r).toEqual({ enviar: true, motivo: "ok" } as never);
    expect(f.chamadas).toHaveLength(1);
    expect(f.chamadas[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const corpo = JSON.parse(String(f.chamadas[0].init.body));
    expect(corpo.model).toBe("gpt-5.4-mini");
    expect(corpo.reasoning_effort).toBe("low");
    expect(corpo.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "decisao", schema: { type: "object" } },
    });
    expect(corpo.messages).toEqual([
      { role: "system", content: "sistema" },
      { role: "user", content: "usuario" },
    ]);
    const headers = new Headers(f.chamadas[0].init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-teste");
  });

  test("retenta uma vez em 503", async () => {
    const f = fetchFalso([new Response("ocupado", { status: 503 }), conteudo({ texto: "oi" })]);
    const r = await criarClienteOpenAi(f.fn)?.chatJson(PEDIDO);
    expect(r).toEqual({ texto: "oi" });
    expect(f.chamadas).toHaveLength(2);
  });

  test("503 duas vezes lança ErroIa com status", async () => {
    const f = fetchFalso([new Response("x", { status: 503 }), new Response("x", { status: 503 })]);
    const erro = await criarClienteOpenAi(f.fn)
      ?.chatJson(PEDIDO)
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroIa);
    expect((erro as ErroIa).status).toBe(503);
    expect(f.chamadas).toHaveLength(2);
  });

  test("400 lança ErroIa sem retentar", async () => {
    const f = fetchFalso([new Response('{"error":"ruim"}', { status: 400 })]);
    const erro = await criarClienteOpenAi(f.fn)
      ?.chatJson(PEDIDO)
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroIa);
    expect((erro as ErroIa).status).toBe(400);
    expect(f.chamadas).toHaveLength(1);
  });

  test("401 não leva o corpo (chave mascarada) para a mensagem do erro", async () => {
    const corpo = {
      error: {
        message: "Incorrect API key provided: sk-proj-AbCd************wxyz.",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    };
    const f = fetchFalso([new Response(JSON.stringify(corpo), { status: 401 })]);
    const erro = (await criarClienteOpenAi(f.fn)
      ?.chatJson(PEDIDO)
      .catch((e: unknown) => e)) as ErroIa;
    expect(erro).toBeInstanceOf(ErroIa);
    expect(erro.status).toBe(401);
    expect(erro.message).toBe("OpenAI respondeu 401 (invalid_api_key, invalid_request_error)");
    expect(erro.message).not.toContain("sk-");
  });

  test("erro sem JSON fica só com o status", async () => {
    const f = fetchFalso([new Response("<html>sk-segredo</html>", { status: 400 })]);
    const erro = (await criarClienteOpenAi(f.fn)
      ?.chatJson(PEDIDO)
      .catch((e: unknown) => e)) as ErroIa;
    expect(erro.message).toBe("OpenAI respondeu 400");
  });

  test("timeout retenta e depois lança", async () => {
    let n = 0;
    const travado = (_url: string, init: RequestInit) => {
      n += 1;
      return new Promise<Response>((_, rejeitar) => {
        init.signal?.addEventListener("abort", () => rejeitar(new Error("abortado")));
      });
    };
    const erro = await criarClienteOpenAi(travado)
      ?.chatJson({ ...PEDIDO, timeoutMs: 20 })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroIa);
    expect((erro as ErroIa).status).toBeNull();
    expect(n).toBe(2);
  });

  test("conteúdo que não é JSON lança ErroIa", async () => {
    const f = fetchFalso([ok({ choices: [{ message: { content: "nao json" } }] })]);
    const erro = await criarClienteOpenAi(f.fn)
      ?.chatJson(PEDIDO)
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroIa);
  });

  test("transcrever manda multipart com language=pt", async () => {
    const f = fetchFalso([ok({ text: "olá, quero agendar" })]);
    const texto = await criarClienteOpenAi(f.fn)?.transcrever({
      dados: new Uint8Array([1, 2, 3]),
      mime: "audio/ogg",
      nomeArquivo: "audio.ogg",
    });
    expect(texto).toBe("olá, quero agendar");
    expect(f.chamadas[0].url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const corpo = f.chamadas[0].init.body as FormData;
    expect(corpo).toBeInstanceOf(FormData);
    expect(corpo.get("language")).toBe("pt");
    expect(corpo.get("model")).toBe(process.env.OPENAI_MODELO_TRANSCRICAO || "whisper-1");
    const arquivo = corpo.get("file") as File;
    expect(arquivo.name).toBe("audio.ogg");
    expect(arquivo.type).toBe("audio/ogg");
  });
});

describe("cliente OpenAI, anexos", () => {
  const dados = new Uint8Array([1, 2, 3]);
  const b64 = "AQID";

  async function corpoCom(anexos?: PedidoChat["anexos"]) {
    const f = fetchFalso([conteudo({})]);
    await criarClienteOpenAi(f.fn)?.chatJson({ ...PEDIDO, anexos });
    return JSON.parse(String(f.chamadas[0].init.body));
  }

  test("sem anexos o conteúdo do usuário segue string", async () => {
    expect((await corpoCom()).messages[1]).toEqual({ role: "user", content: "usuario" });
    expect((await corpoCom([])).messages[1]).toEqual({ role: "user", content: "usuario" });
  });

  test("imagem e PDF viram partes do conteúdo", async () => {
    const corpo = await corpoCom([
      { mime: "image/jpeg", dados, nomeArquivo: "a.jpg" },
      { mime: "application/pdf", dados, nomeArquivo: "b.pdf" },
    ]);
    expect(corpo.messages[1].content).toEqual([
      { type: "text", text: "usuario" },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
      {
        type: "file",
        file: { filename: "b.pdf", file_data: `data:application/pdf;base64,${b64}` },
      },
    ]);
  });

  test("mime não suportado lança ErroIa", async () => {
    const f = fetchFalso([]);
    const ia = criarClienteOpenAi(f.fn);
    await expect(
      ia?.chatJson({ ...PEDIDO, anexos: [{ mime: "video/mp4", dados, nomeArquivo: "v.mp4" }] }),
    ).rejects.toThrow("anexo não suportado");
    await expect(
      ia?.chatJson({ ...PEDIDO, anexos: [{ mime: "image/heic", dados, nomeArquivo: "f.heic" }] }),
    ).rejects.toThrow("anexo não suportado");
    expect(f.chamadas).toHaveLength(0);
  });
});

test("anexoSuportado aceita só PNG, JPEG, WebP, GIF e PDF, ignorando parâmetros do mime", () => {
  expect(
    ["image/jpeg; x=y", "IMAGE/PNG", "image/webp", "image/gif", "application/pdf"].map(
      anexoSuportado,
    ),
  ).toEqual([true, true, true, true, true]);
  expect(["image/heic", "video/mp4", "application/zip"].map(anexoSuportado)).toEqual([
    false,
    false,
    false,
  ]);
});
