import { describe, expect, test } from "bun:test";

import { criarAdaptadorEvolution } from "./api";
import { type Envio, ErroEnvio } from "./tipos";

const CHAVE = "chave-secreta-de-teste";

type Pedido = { url: string; metodo: string; headers: Record<string, string>; corpo: unknown };

function adaptador(resposta: () => Response | Promise<Response>) {
  const pedidos: Pedido[] = [];
  const f = (async (url: string, init: RequestInit) => {
    pedidos.push({
      url,
      metodo: String(init.method),
      headers: init.headers as Record<string, string>,
      corpo: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return resposta();
  }) as unknown as typeof fetch;
  const a = criarAdaptadorEvolution({
    url: "http://evolution.teste:8080/",
    apiKey: CHAVE,
    instancia: "wakeclub",
    fetch: f,
  });
  return { a, pedidos };
}

const json = (corpo: unknown, status = 201) => Response.json(corpo, { status });
const ok = () =>
  json({ key: { remoteJid: "5563900000001@s.whatsapp.net", fromMe: true, id: "ID1" } });

async function erroDe(p: Promise<unknown>): Promise<ErroEnvio> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ErroEnvio);
    expect((e as Error).message).not.toContain(CHAVE);
    expect((e as Error).message).not.toContain("corpo-da-evolution");
    return e as ErroEnvio;
  }
  throw new Error("esperava erro");
}

const TEXTO: Envio = { telefone: "+5563900000001", tipo: "texto", texto: "Olá" };

describe("enviar", () => {
  test("texto: rota, header apikey e corpo", async () => {
    const { a, pedidos } = adaptador(ok);
    expect(await a.enviar(TEXTO)).toEqual({ evolutionMsgId: "ID1" });
    expect(pedidos[0]).toEqual({
      url: "http://evolution.teste:8080/message/sendText/wakeclub",
      metodo: "POST",
      headers: { apikey: CHAVE, "content-type": "application/json" },
      corpo: { number: "5563900000001", text: "Olá" },
    });
  });

  test.each<[Envio, string, unknown]>([
    [
      {
        telefone: "+5563900000001",
        tipo: "imagem",
        base64: "QUJD",
        mime: "image/jpeg",
        legenda: "foto",
      },
      "message/sendMedia",
      {
        number: "5563900000001",
        mediatype: "image",
        mimetype: "image/jpeg",
        media: "QUJD",
        caption: "foto",
      },
    ],
    [
      {
        telefone: "+5563900000001",
        tipo: "documento",
        base64: "QUJD",
        mime: "application/pdf",
        nomeArquivo: "a.pdf",
      },
      "message/sendMedia",
      {
        number: "5563900000001",
        mediatype: "document",
        mimetype: "application/pdf",
        media: "QUJD",
        fileName: "a.pdf",
      },
    ],
    [
      { telefone: "+5563900000001", tipo: "video", base64: "QUJD", mime: "video/mp4" },
      "message/sendMedia",
      { number: "5563900000001", mediatype: "video", mimetype: "video/mp4", media: "QUJD" },
    ],
    [
      { telefone: "+5563900000001", tipo: "audio", base64: "QUJD", mime: "audio/webm" },
      "message/sendWhatsAppAudio",
      { number: "5563900000001", audio: "QUJD" },
    ],
    [
      {
        telefone: "+5563900000001",
        tipo: "localizacao",
        latitude: -10.1,
        longitude: -48.3,
        nome: "Lago",
      },
      "message/sendLocation",
      { number: "5563900000001", latitude: -10.1, longitude: -48.3, name: "Lago", address: "" },
    ],
  ])("%#: %p", async (envio, rota, corpo) => {
    const { a, pedidos } = adaptador(ok);
    await a.enviar(envio);
    expect(pedidos[0].url).toBe(`http://evolution.teste:8080/${rota}/wakeclub`);
    expect(pedidos[0].corpo).toEqual(corpo);
  });

  test.each([400, 401, 403, 404, 422])("%d → nao_saiu", async (status) => {
    const { a } = adaptador(() => json({ erro: "corpo-da-evolution" }, status));
    expect((await erroDe(a.enviar(TEXTO))).certeza).toBe("nao_saiu");
  });

  test.each([
    ["500", () => json({ erro: "corpo-da-evolution" }, 500)],
    ["502", () => new Response("corpo-da-evolution", { status: 502 })],
    ["408", () => new Response("corpo-da-evolution", { status: 408 })],
    ["lixo", () => new Response("corpo-da-evolution <html>", { status: 201 })],
    ["sem id", () => json({ status: "PENDING" })],
    [
      "timeout",
      () => {
        throw new DOMException(`timeout em http://x?apikey=${CHAVE}`, "TimeoutError");
      },
    ],
  ])("%s → incerto", async (_, resposta) => {
    const { a } = adaptador(resposta);
    expect((await erroDe(a.enviar(TEXTO))).certeza).toBe("incerto");
  });
});

describe("baixarMidia", () => {
  test("decodifica base64 e limpa o mime", async () => {
    const { a, pedidos } = adaptador(() =>
      json({ base64: Buffer.from("OggS").toString("base64"), mimetype: "audio/ogg; codecs=opus" }),
    );
    const m = await a.baixarMidia("MSG1");
    expect(m?.mime).toBe("audio/ogg");
    expect(new TextDecoder().decode(m?.dados)).toBe("OggS");
    expect(pedidos[0]).toMatchObject({
      url: "http://evolution.teste:8080/chat/getBase64FromMediaMessage/wakeclub",
      headers: { apikey: CHAVE },
      corpo: { message: { key: { id: "MSG1" } }, convertToMp4: false },
    });
  });

  test("400/404 ou sem base64 → null; 5xx e rede lançam sem segredo", async () => {
    expect(await adaptador(() => json({}, 400)).a.baixarMidia("X")).toBeNull();
    expect(await adaptador(() => json({}, 404)).a.baixarMidia("X")).toBeNull();
    expect(await adaptador(() => json({ base64: "" })).a.baixarMidia("X")).toBeNull();
    await expect(adaptador(() => json({}, 500)).a.baixarMidia("X")).rejects.toThrow("500");
    const rede = adaptador(() => {
      throw new Error(`falhou ${CHAVE}`);
    });
    await expect(rede.a.baixarMidia("X")).rejects.toThrow(/^Evolution sem resposta/);
  });
});

describe("estadoConexao", () => {
  test("lê instance.state", async () => {
    const { a, pedidos } = adaptador(() =>
      json({ instance: { instanceName: "wakeclub", state: "open" } }, 200),
    );
    expect(await a.estadoConexao()).toBe("open");
    expect(pedidos[0]).toMatchObject({
      url: "http://evolution.teste:8080/instance/connectionState/wakeclub",
      metodo: "GET",
      headers: { apikey: CHAVE },
    });
  });

  test("aceita state na raiz; desconhecido e erro HTTP lançam", async () => {
    expect(await adaptador(() => json({ state: "close" }, 200)).a.estadoConexao()).toBe("close");
    await expect(adaptador(() => json({ instance: {} }, 200)).a.estadoConexao()).rejects.toThrow(
      "desconhecido",
    );
    await expect(adaptador(() => json({}, 401)).a.estadoConexao()).rejects.toThrow("401");
  });
});
