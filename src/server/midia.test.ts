import { describe, expect, test } from "bun:test";

import { randomUUID } from "node:crypto";

import { cabecalhosMidia, intervaloPedido, nomeArquivoSeguro, responderMidia } from "./midia";

describe("nomeArquivoSeguro", () => {
  test("extrai o nome do marcador do documento", () => {
    expect(nomeArquivoSeguro("[documento contrato.pdf]")).toBe("contrato.pdf");
  });

  test("sem nome conhecido devolve null", () => {
    expect(nomeArquivoSeguro("[documento]")).toBeNull();
    expect(nomeArquivoSeguro("segue a proposta")).toBeNull();
    expect(nomeArquivoSeguro(null)).toBeNull();
  });

  test("tira caminho, aspas e controle", () => {
    expect(nomeArquivoSeguro('[documento ../../etc/pa"ss\r\nwd.pdf]')).toBe("passwd.pdf");
    expect(nomeArquivoSeguro("[documento C:\\x\\a;b.pdf]")).toBe("ab.pdf");
    expect(nomeArquivoSeguro("[documento ..]")).toBeNull();
  });
});

describe("cabecalhosMidia", () => {
  test("imagem do tipo esperado abre inline, cache só privado", () => {
    const h = cabecalhosMidia("imagem", "image/jpeg", 10, null);
    expect(h.get("Content-Type")).toBe("image/jpeg");
    expect(h.get("Content-Length")).toBe("10");
    expect(h.get("Content-Disposition")).toBe("inline");
    expect(h.get("Cache-Control")).toBe("private, max-age=300");
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Content-Security-Policy")).toContain("sandbox");
  });

  test("documento baixa com o nome, ASCII e UTF-8", () => {
    const h = cabecalhosMidia("documento", "application/pdf", 3, "orçamento.pdf");
    expect(h.get("Content-Type")).toBe("application/pdf");
    expect(h.get("Content-Disposition")).toBe(
      `attachment; filename="or_amento.pdf"; filename*=UTF-8''or%C3%A7amento.pdf`,
    );
  });

  test("documento sem nome usa um genérico", () => {
    expect(
      cabecalhosMidia("documento", "application/pdf", 3, null).get("Content-Disposition"),
    ).toBe(`attachment; filename="documento"; filename*=UTF-8''documento`);
  });

  test("mime fora do tipo ou SVG nunca abre inline", () => {
    for (const [tipo, mime] of [
      ["imagem", "text/html"],
      ["imagem", "image/svg+xml"],
      ["audio", "video/mp4"],
    ] as const) {
      const h = cabecalhosMidia(tipo, mime, 1, null);
      expect(h.get("Content-Disposition")).toStartWith("attachment");
      expect(h.get("Content-Type")).toBe("application/octet-stream");
    }
  });
});

describe("responderMidia sem tocar no banco", () => {
  test("id inválido responde 404", async () => {
    expect((await responderMidia("nao-e-uuid", null)).status).toBe(404);
  });

  test("sem sessão responde 401", async () => {
    const r = await responderMidia(randomUUID(), null, () => Promise.resolve(null));
    expect(r.status).toBe(401);
  });

  test("falha inesperada responde 500 genérico", async () => {
    const r = await responderMidia(randomUUID(), null, () => Promise.reject(new Error("x")));
    expect(r.status).toBe(500);
  });
});

describe("intervaloPedido", () => {
  test("sem Range ou com vários pedaços serve inteiro", () => {
    expect(intervaloPedido(null, 10)).toBeNull();
    expect(intervaloPedido("bytes=0-1,4-5", 10)).toBeNull();
    expect(intervaloPedido("itens=0-1", 10)).toBeNull();
  });

  test("a-b, a- e sufixo -n", () => {
    expect(intervaloPedido("bytes=0-1", 10)).toEqual({ inicio: 0, fim: 1 });
    expect(intervaloPedido("bytes=2-", 10)).toEqual({ inicio: 2, fim: 9 });
    expect(intervaloPedido("bytes=-3", 10)).toEqual({ inicio: 7, fim: 9 });
    expect(intervaloPedido("bytes=-30", 10)).toEqual({ inicio: 0, fim: 9 });
    expect(intervaloPedido("bytes=5-99", 10)).toEqual({ inicio: 5, fim: 9 });
  });

  test("fora do arquivo ou malformado é 416", () => {
    for (const r of ["bytes=10-", "bytes=10-12", "bytes=5-2", "bytes=-0", "bytes=-", "bytes=a-b"]) {
      expect(intervaloPedido(r, 10)).toBe("invalido");
    }
    expect(intervaloPedido("bytes=0-", 0)).toBe("invalido");
  });
});
