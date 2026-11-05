import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { chaveDeOrdemDoCorpo, nivelDoAck, normalizarEvolution, paraIso } from "./normalizar";

const fixture = (nome: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${nome}.json`, import.meta.url), "utf8"));

const EM = "2026-11-04T10:15:00.000Z";
const LEAD = "+5563900000001";

const mensagem = (nome: string) => {
  const r = normalizarEvolution(fixture(nome));
  expect(r).toHaveLength(1);
  return r[0];
};

describe("normalizarEvolution: mensagens", () => {
  test("texto recebido", () => {
    expect(mensagem("texto-recebido")).toEqual({
      tipo: "mensagem",
      telefone: LEAD,
      nome: "Maria Teste",
      daEquipe: false,
      texto: "Oi, quero saber o preço da aula",
      tipoMidia: "texto",
      enviadaEm: EM,
      evolutionMsgId: "3EB0A0000000000000001",
    });
  });

  test("texto enviado pelo celular é da equipe e não leva nome", () => {
    expect(mensagem("texto-enviado-celular")).toMatchObject({
      daEquipe: true,
      nome: null,
      texto: "Bom dia! Temos horário às 15h.",
      evolutionMsgId: "3EB0A0000000000000002",
    });
  });

  test.each([
    ["texto-estendido", "Vi esse link https://exemplo.test", "texto"],
    ["imagem-legenda", "Essa é a prancha?", "imagem"],
    ["imagem-sem-legenda", "[imagem]", "imagem"],
    ["audio", "[audio]", "audio"],
    ["video", "[video]", "video"],
    ["documento", "[documento comprovante.pdf]", "documento"],
    ["documento-com-legenda", "Segue o contrato", "documento"],
    ["figurinha", "[figurinha]", "figurinha"],
    ["localizacao", "[localizacao]", "localizacao"],
    ["contato", "[contato]", "contato"],
    ["botao-resposta", "Quero agendar", "texto"],
    ["lista-resposta", "Aula experimental", "texto"],
    ["efemera-visualizacao-unica", "Foto única", "imagem"],
    ["editada", "Corrigindo: amanhã às 16h", "texto"],
    ["editada-baileys", "Na verdade, às 17h", "texto"],
    ["editada-protocolo", "Editado: sábado", "texto"],
  ])("%s", (nome, texto, tipoMidia) => {
    expect(mensagem(nome)).toMatchObject({ tipo: "mensagem", telefone: LEAD, texto, tipoMidia });
  });

  test("12 dígitos ganha o 9 e timestamp em ms", () => {
    expect(mensagem("timestamp-ms-numero-12")).toMatchObject({
      telefone: "+5563990000002",
      enviadaEm: "2026-11-04T10:15:00.123Z",
    });
  });

  test("@lid usa o número real de remoteJidAlt", () => {
    expect(mensagem("lid-com-alt")).toMatchObject({ telefone: "+5563900000003" });
  });

  test.each([
    ["grupo", "mensagem de grupo"],
    ["newsletter", "status ou canal"],
    ["status-broadcast", "status ou canal"],
    ["lid-sem-alt", "jid @lid sem numero real"],
  ])("%s é ignorado", (nome, motivo) => {
    expect(mensagem(nome)).toEqual({ tipo: "ignorar", motivo });
  });

  test("data em lista gera um evento por item; corpo inválido é ignorado", () => {
    const c = fixture("texto-recebido") as { data: unknown };
    expect(normalizarEvolution({ ...c, data: [c.data, c.data] })).toHaveLength(2);
    expect(normalizarEvolution(null)[0].tipo).toBe("ignorar");
    expect(normalizarEvolution({ event: "chats.update", data: {} })).toEqual([
      { tipo: "ignorar", motivo: "evento nao tratado: chats.update" },
    ]);
  });
});

describe("normalizarEvolution: saúde", () => {
  test("ack com status em texto", () => {
    expect(normalizarEvolution(fixture("ack-texto"))).toEqual([
      { tipo: "ack", evolutionMsgId: "3EB0A0000000000000002", nivel: 4 },
    ]);
  });

  test("ack numérico em lista e status desconhecido ignorado (MESSAGES_UPDATE)", () => {
    expect(normalizarEvolution(fixture("ack-numerico"))).toEqual([
      { tipo: "ack", evolutionMsgId: "3EB0A0000000000000002", nivel: 3 },
      { tipo: "ignorar", motivo: "ack sem id ou status conhecido" },
    ]);
  });

  test("mapa de ack", () => {
    const casos: [unknown, number | null][] = [
      ["ERROR", 0],
      [0, 0],
      ["PENDING", 1],
      ["SERVER_ACK", 2],
      ["server", 2],
      [2, 2],
      ["DELIVERY_ACK", 3],
      ["DELIVERED", 3],
      ["READ", 4],
      ["4", 4],
      ["PLAYED", 5],
      [5, 5],
      ["outro", null],
      [undefined, null],
    ];
    for (const [bruto, nivel] of casos) expect(nivelDoAck(bruto)).toBe(nivel as never);
  });

  test("conexão aberta e fechada com statusReason", () => {
    const [aberta] = normalizarEvolution(fixture("conexao-aberta"));
    expect(aberta).toMatchObject({
      tipo: "conexao",
      instancia: "wakeclub",
      evento: "connection.update",
      estado: "open",
      statusReason: 200,
      qrPendente: false,
    });
    expect(normalizarEvolution(fixture("conexao-fechada"))[0]).toMatchObject({
      estado: "close",
      statusReason: 401,
    });
  });

  test("qrcode.updated marca QR pendente sem guardar o QR", () => {
    expect(normalizarEvolution(fixture("qrcode"))).toEqual([
      {
        tipo: "conexao",
        instancia: "wakeclub",
        evento: "qrcode.updated",
        estado: null,
        statusReason: null,
        qrPendente: true,
        detalhe: { evento: "qrcode.updated", tentativa: 2 },
      },
    ]);
  });

  test("messages.edited com status vira ack", () => {
    expect(normalizarEvolution(fixture("mensagem-editada-evento"))).toEqual([
      { tipo: "ack", evolutionMsgId: "3EB0A0000000000000002", nivel: 2 },
    ]);
  });

  test("remove.instance fecha; application.startup lê o estado", () => {
    expect(normalizarEvolution(fixture("remove-instancia"))[0]).toMatchObject({
      evento: "remove.instance",
      estado: "close",
    });
    expect(normalizarEvolution(fixture("inicio-aplicacao"))[0]).toMatchObject({
      tipo: "conexao",
      evento: "application.startup",
      estado: "connecting",
      statusReason: null,
    });
  });

  test("logout.instance fecha", () => {
    expect(normalizarEvolution(fixture("logout"))[0]).toMatchObject({
      evento: "logout.instance",
      estado: "close",
    });
  });

  test("apikey do envelope nunca sai no resultado", () => {
    for (const nome of [
      "conexao-aberta",
      "conexao-fechada",
      "qrcode",
      "logout",
      "texto-recebido",
    ]) {
      const c = fixture(nome) as { data: Record<string, unknown> };
      const comChave = { ...c, data: { ...c.data, apikey: "chave-ficticia-nao-usar" } };
      expect(JSON.stringify(normalizarEvolution(comChave))).not.toContain("chave-ficticia");
    }
  });
});

describe("chaveDeOrdemDoCorpo", () => {
  test.each([
    ["texto-recebido", LEAD],
    ["lid-com-alt", "+5563900000003"],
    ["lid-sem-alt", "123456789012346@lid"],
    ["grupo", "120363000000000001@g.us"],
    ["ack-texto", LEAD],
    ["ack-numerico", LEAD],
    ["ack-lid-com-alt", "+5563900000003"],
    ["ack-lid-key-sender", "+5563900000003"],
    ["mensagem-editada-evento", LEAD],
    ["remove-instancia", "instancia:wakeclub"],
    ["conexao-aberta", "instancia:wakeclub"],
    ["qrcode", "instancia:wakeclub"],
  ])("%s → %s", (nome, chave) => {
    expect(chaveDeOrdemDoCorpo(fixture(nome))).toBe(chave);
  });

  test("ack do @lid cai na mesma fila da mensagem", () => {
    const msg = chaveDeOrdemDoCorpo(fixture("lid-com-alt"));
    expect(chaveDeOrdemDoCorpo(fixture("ack-lid-com-alt"))).toBe(msg);
    expect(chaveDeOrdemDoCorpo(fixture("ack-lid-key-sender"))).toBe(msg);
  });

  test("sem nada reconhecível", () => {
    expect(chaveDeOrdemDoCorpo(null)).toBeNull();
    expect(chaveDeOrdemDoCorpo({ event: "x" })).toBe("evolution");
  });
});

test("paraIso: segundos, ms, Long, ISO e lixo", () => {
  const agora = () => new Date(EM);
  expect(paraIso(1793787300)).toBe(EM);
  expect(paraIso("1793787300000")).toBe(EM);
  expect(paraIso({ low: 1793787300, high: 0 })).toBe(EM);
  expect(paraIso(EM)).toBe(EM);
  expect(paraIso("lixo", agora)).toBe(EM);
  expect(paraIso(undefined, agora)).toBe(EM);
});
