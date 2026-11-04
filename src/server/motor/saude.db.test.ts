import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { getPoolMotor } from "../db";
import type { EventoConexao } from "../evolution/tipos";
import { bancoTesteAtivo, telefoneUnico } from "./banco-teste";
import { registrarMensagem } from "./ingestao";
import { aplicarAck, aplicarConexao, gravarHeartbeat } from "./saude";

const db = () => getPoolMotor();
const instancia = () => `t-${randomUUID().slice(0, 8)}`;

function conexao(i: string, extra: Partial<EventoConexao> = {}): EventoConexao {
  return {
    tipo: "conexao",
    instancia: i,
    evento: "Connected",
    estado: "open",
    statusReason: null,
    qrPendente: false,
    detalhe: {},
    ...extra,
  };
}

async function estado(i: string) {
  const { rows } = await db().query(
    "select * from wakeclub.instancia_estado where instancia = $1::text",
    [i],
  );
  return rows[0];
}

describe.skipIf(!bancoTesteAtivo)("saude do numero", () => {
  test("ack fora de ordem fica no maior", async () => {
    const id = randomUUID();
    await registrarMensagem(db() as never, {
      tipo: "mensagem",
      telefone: telefoneUnico(),
      nome: null,
      daEquipe: true,
      texto: "oi",
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      evolutionMsgId: id,
    });
    await aplicarAck(db() as never, id, 3);
    await aplicarAck(db() as never, id, 2);
    const { rows } = await db().query(
      "select entrega_nivel from wakeclub.mensagens where evolution_msg_id = $1::text",
      [id],
    );
    expect(rows[0].entrega_nivel).toBe(3);
  });

  test("open apos close marca conectado_desde e zera qr", async () => {
    const i = instancia();
    await aplicarConexao(db() as never, conexao(i, { estado: "close", qrPendente: true }));
    let e = await estado(i);
    expect(e.desconectado_desde).not.toBeNull();
    expect(e.qr_pendente).toBe(true);
    await aplicarConexao(db() as never, conexao(i));
    e = await estado(i);
    expect(e.estado).toBe("open");
    expect(e.conectado_desde).not.toBeNull();
    expect(e.qr_pendente).toBe(false);
    expect(e.qr_contador).toBe(0);
  });

  test("qr incrementa contador", async () => {
    const i = instancia();
    const qr = conexao(i, { estado: "connecting", qrPendente: true, evento: "QR" });
    await aplicarConexao(db() as never, qr);
    await aplicarConexao(db() as never, qr);
    expect((await estado(i)).qr_contador).toBe(2);
  });

  test("heartbeat com erro grava heartbeat_ok false", async () => {
    const i = instancia();
    await gravarHeartbeat(db() as never, i, { erro: "timeout" });
    const e = await estado(i);
    expect(e.heartbeat_ok).toBe(false);
    expect(e.heartbeat_erro).toBe("timeout");
    await gravarHeartbeat(db() as never, i, { estado: "open" });
    expect((await estado(i)).heartbeat_ok).toBe(true);
  });
});
