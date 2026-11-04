import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import type { EventoMensagem } from "./evolution/tipos";
import { comTransacao, getPool, getPoolMotor } from "./db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";
import type { Sessao } from "./auth";
import { gravarEnvio, podeEnviar, schemaEnvio } from "./envio";

const sessao = (usuarioId: string, papel: Sessao["papel"]): Sessao => ({
  usuarioId,
  nome: "T",
  usuario: "t",
  papel,
  labelId: null,
});

function eco(telefone: string, evolutionMsgId: string): EventoMensagem {
  return {
    tipo: "mensagem",
    telefone,
    nome: null,
    daEquipe: true,
    texto: "ola",
    tipoMidia: "texto",
    enviadaEm: new Date().toISOString(),
    evolutionMsgId,
  };
}

async function linhas(evolutionMsgId: string) {
  const { rows } = await getPoolMotor().query<{ enviada_por: string; usuario_id: string | null }>(
    "select enviada_por, usuario_id from wakeclub.mensagens where evolution_msg_id = $1::text",
    [evolutionMsgId],
  );
  return rows;
}

describe.skipIf(!bancoTesteAtivo)("envio pelo app", () => {
  test("atendente nao envia para lead de outro", async () => {
    const dono = await criarVendedor("Dono");
    const outro = await criarVendedor("Outro");
    const admin = await criarVendedor("Admin");
    const telefone = telefoneUnico();
    const { leadId } = await comTransacao((c) => registrarMensagem(c, eco(telefone, randomUUID())));
    await getPoolMotor().query(
      "update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid",
      [leadId, dono],
    );
    const db = getPoolMotor();
    expect(await podeEnviar(db, leadId, sessao(outro, "atendente"))).toBeNull();
    expect(await podeEnviar(db, leadId, sessao(dono, "atendente"))).toEqual({ telefone });
    expect(await podeEnviar(db, leadId, sessao(admin, "admin"))).toEqual({ telefone });
    await getPoolMotor().query("update wakeclub.leads set opt_out = true where id = $1::uuid", [
      leadId,
    ]);
    // Opt-out proíbe follow-up, não a resposta humana (design §5.3).
    expect(await podeEnviar(db, leadId, sessao(dono, "atendente"))).toEqual({ telefone });
    expect(await podeEnviar(db, leadId, sessao(outro, "atendente"))).toBeNull();
  });

  test("eco antes do insert", async () => {
    const usuarioId = await criarVendedor("Autor");
    const m = eco(telefoneUnico(), randomUUID());
    await comTransacao((c) => registrarMensagem(c, m));
    expect((await linhas(m.evolutionMsgId))[0].enviada_por).toBe("celular");
    await comTransacao((c) => registrarMensagem(c, m, { usuarioId }));
    expect(await linhas(m.evolutionMsgId)).toEqual([{ enviada_por: "app", usuario_id: usuarioId }]);
  });

  test("v_mensagens_autoria mostra a autoria ao painel_ro", async () => {
    const usuarioId = await criarVendedor("Autora Fulana");
    const doApp = eco(telefoneUnico(), randomUUID());
    const doCelular = eco(telefoneUnico(), randomUUID());
    const a = await comTransacao((c) => registrarMensagem(c, doApp, { usuarioId }));
    const b = await comTransacao((c) => registrarMensagem(c, doCelular));
    const { rows } = await getPool().query(
      `select mensagem_id, enviada_por, autor_nome from wakeclub.v_mensagens_autoria
        where mensagem_id = any($1::uuid[]) order by enviada_por`,
      [[a.mensagemId, b.mensagemId]],
    );
    expect(rows).toEqual([
      { mensagem_id: a.mensagemId, enviada_por: "app", autor_nome: "Autora Fulana" },
      { mensagem_id: b.mensagemId, enviada_por: "celular", autor_nome: null },
    ]);
  });

  test("eco depois do insert nao duplica", async () => {
    const usuarioId = await criarVendedor("Autor");
    const m = eco(telefoneUnico(), randomUUID());
    await comTransacao((c) => registrarMensagem(c, m, { usuarioId }));
    await comTransacao((c) => registrarMensagem(c, m));
    expect(await linhas(m.evolutionMsgId)).toEqual([{ enviada_por: "app", usuario_id: usuarioId }]);
  });
});

describe("schema do envio", () => {
  const ok = { tipo: "imagem", base64: "aGVsbG8=", mime: "image/png" };
  test("aceita valido e recusa mime errado por tipo", () => {
    expect(schemaEnvio.safeParse(ok).success).toBe(true);
    for (const [tipo, mime] of [
      ["imagem", "video/mp4"],
      ["video", "image/png"],
      ["audio", "video/mp4"],
      ["documento", "image/png"],
    ]) {
      expect(schemaEnvio.safeParse({ ...ok, tipo, mime }).success).toBe(false);
    }
    expect(
      schemaEnvio.safeParse({ ...ok, tipo: "documento", mime: "application/pdf" }).success,
    ).toBe(true);
  });
  test("recusa base64 invalido", () => {
    expect(schemaEnvio.safeParse({ ...ok, base64: "não é base64!" }).success).toBe(false);
  });
});

describe.skipIf(!bancoTesteAtivo)("rotulos do envio (padrao WF-01)", () => {
  const casos = [
    [{ tipo: "imagem", base64: "YQ==", mime: "image/png" }, "[imagem]"],
    [{ tipo: "imagem", base64: "YQ==", mime: "image/png", legenda: "olha" }, "olha"],
    [{ tipo: "video", base64: "YQ==", mime: "video/mp4" }, "[video]"],
    [{ tipo: "documento", base64: "YQ==", mime: "application/pdf" }, "[documento]"],
    [
      { tipo: "documento", base64: "YQ==", mime: "application/pdf", nomeArquivo: "a.pdf" },
      "[documento a.pdf]",
    ],
    [{ tipo: "audio", base64: "YQ==", mime: "audio/ogg" }, "[audio]"],
    [{ tipo: "localizacao", latitude: 1, longitude: 2 }, "[localizacao]"],
  ] as const;
  test.each(casos)("%j grava %s", async (envio, texto) => {
    const usuarioId = await criarVendedor("Autor");
    const id = randomUUID();
    await comTransacao((c) =>
      gravarEnvio(c, telefoneUnico(), envio, { evolutionMsgId: id, usuarioId }),
    );
    const { rows } = await getPoolMotor().query(
      "select texto, tipo from wakeclub.mensagens where evolution_msg_id = $1::text",
      [id],
    );
    expect(rows).toEqual([{ texto, tipo: envio.tipo }]);
  });
});
