import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor } from "./db";
import { lerMensagemMidia } from "./midia";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";

const db = () => getPoolMotor();

async function mensagem(tipoMidia: "texto" | "imagem" | "documento", texto: string) {
  const dono = await criarVendedor("Dona");
  const evolutionMsgId = randomUUID();
  const { leadId, mensagemId } = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone: telefoneUnico(),
      nome: "Lead Mídia",
      daEquipe: false,
      texto,
      tipoMidia,
      enviadaEm: new Date().toISOString(),
      evolutionMsgId,
    }),
  );
  await db().query("update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid", [
    leadId,
    dono,
  ]);
  if (!mensagemId) throw new Error("mensagem não gravada");
  return { mensagemId, dono, evolutionMsgId };
}

describe.skipIf(!bancoTesteAtivo)("lerMensagemMidia", () => {
  test("dona e admin leem; outra atendente não", async () => {
    const { mensagemId, dono, evolutionMsgId } = await mensagem("documento", "[documento a.pdf]");
    const esperado = {
      tipo: "documento" as const,
      evolution_msg_id: evolutionMsgId,
      texto: "[documento a.pdf]",
    };
    expect(
      await lerMensagemMidia(db(), mensagemId, { papel: "atendente", usuarioId: dono }),
    ).toEqual(esperado);
    expect(
      await lerMensagemMidia(db(), mensagemId, { papel: "admin", usuarioId: randomUUID() }),
    ).toEqual(esperado);
    const outra = await criarVendedor("Outra");
    expect(
      await lerMensagemMidia(db(), mensagemId, { papel: "atendente", usuarioId: outra }),
    ).toBeNull();
  });

  test("mensagem de texto não é mídia", async () => {
    const { mensagemId } = await mensagem("texto", "oi");
    expect(
      await lerMensagemMidia(db(), mensagemId, { papel: "admin", usuarioId: randomUUID() }),
    ).toBeNull();
  });
});
