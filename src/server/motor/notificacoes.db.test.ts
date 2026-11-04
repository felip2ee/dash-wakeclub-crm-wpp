import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";

import { comTransacao, getPoolMotor } from "../db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import { criarProcessadorEvolution, registrarMensagem } from "./ingestao";
import {
  enfileirarMensagemNova,
  enviarPushPendentes,
  reivindicarNotificacoes,
} from "./notificacoes";

async function avisos(leadTitulo: string) {
  const { rows } = await getPoolMotor().query<{
    usuario_id: string | null;
    tipo: string;
    url: string;
    titulo: string;
  }>("select usuario_id, tipo, url, titulo from wakeclub.notificacoes where titulo like $1::text", [
    `%${leadTitulo}%`,
  ]);
  return rows;
}

async function leadCom(nome: string, dono: string | null) {
  const r = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone: telefoneUnico(),
      nome,
      daEquipe: false,
      texto: "oi",
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  if (dono)
    await getPoolMotor().query(
      "update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid",
      [r.leadId, dono],
    );
  return r.leadId;
}

describe.skipIf(!bancoTesteAtivo)("enfileirarMensagemNova", () => {
  test("mensagem nova do lead enfileira para o dono", async () => {
    const dono = await criarVendedor("Dono");
    const nome = `Lead ${randomUUID()}`;
    const leadId = await leadCom(nome, dono);
    await comTransacao((c) => enfileirarMensagemNova(c, leadId));
    const r = await avisos(nome);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ usuario_id: dono, tipo: "mensagem", url: "/meus-leads" });
    expect(r[0].titulo).toBe(`Nova mensagem: ${nome}`);
  });

  test("sem dono vai para os admins", async () => {
    const nome = `Lead ${randomUUID()}`;
    const leadId = await leadCom(nome, null);
    await getPoolMotor().query(
      "update wakeclub.leads set atendente_id = null where id = $1::uuid",
      [leadId],
    );
    await comTransacao((c) => enfileirarMensagemNova(c, leadId));
    expect(await avisos(nome)).toMatchObject([{ usuario_id: null, url: "/" }]);
  });

  test("mensagem da equipe nao enfileira", async () => {
    const nome = `Lead ${randomUUID()}`;
    const tel = telefoneUnico();
    await comTransacao((c) => registrarMensagem(c, evento(tel, nome, false, randomUUID()))); // cria o lead com nome
    await processar(tel, "Equipe", true, randomUUID());
    expect(await avisos(nome)).toHaveLength(0);
  });

  test("reprocessar o mesmo evento nao enfileira de novo", async () => {
    const nome = `Lead ${randomUUID()}`;
    const tel = telefoneUnico();
    const id = randomUUID();
    await processar(tel, nome, false, id);
    await processar(tel, nome, false, id);
    expect(await avisos(nome)).toHaveLength(1);
  });
});

function evento(tel: string, nome: string, daEquipe: boolean, id: string) {
  return {
    tipo: "mensagem",
    telefone: tel,
    nome,
    daEquipe,
    texto: "oi",
    tipoMidia: "texto",
    enviadaEm: new Date().toISOString(),
    evolutionMsgId: id,
  } as const;
}

/** Roda o processador da fila com um evento de mensagem. */
async function processar(tel: string, nome: string, daEquipe: boolean, id: string) {
  const proc = criarProcessadorEvolution({
    normalizar: () => [evento(tel, nome, daEquipe, id)],
  } as never);
  await comTransacao((c) => proc(c, { corpo: {} } as never));
}

/** Reivindica tudo o que outros testes deixaram pendente, para o teste ver só o seu aviso. */
async function esvaziarFila() {
  while ((await comTransacao(reivindicarNotificacoes)).length > 0);
}

/** Aviso pendente para um vendedor novo (grupo próprio no agrupamento). */
async function avisoPendente() {
  const usuarioId = await criarVendedor("Destino");
  const { rows } = await getPoolMotor().query<{ id: string }>(
    `insert into wakeclub.notificacoes (usuario_id, tipo, titulo, url)
     values ($1::uuid, 'mensagem', 'Nova mensagem: teste', '/meus-leads')
     returning id`,
    [usuarioId],
  );
  return { usuarioId, id: rows[0].id };
}

async function estado(id: string) {
  const { rows } = await getPoolMotor().query<{ status: string; erro: string | null }>(
    "select status, erro from wakeclub.notificacoes where id = $1::bigint",
    [id],
  );
  return rows[0];
}

// Usa o stub de wakeclub.v_followups_fila do banco de teste (a view real vive em produção).
describe.skipIf(!bancoTesteAtivo)("push pendente", () => {
  test("reivindica a pendente e marca enviando", async () => {
    await esvaziarFila();
    const { usuarioId, id } = await avisoPendente();
    const r = await comTransacao(reivindicarNotificacoes);
    expect(r.map((n) => n.id)).toContain(id);
    expect(r.find((n) => n.id === id)).toMatchObject({ usuarioId, tipo: "mensagem" });
    expect((await estado(id)).status).toBe("enviando");
  });

  test("entrega ok marca enviada", async () => {
    await esvaziarFila();
    const { id } = await avisoPendente();
    await enviarPushPendentes(async () => ({ enviados: 1, removidos: 0, falhas: 0 }));
    expect(await estado(id)).toEqual({ status: "enviada", erro: null });
  });

  test("entrega que lança marca falhou com o erro", async () => {
    await esvaziarFila();
    const { usuarioId, id } = await avisoPendente();
    await enviarPushPendentes(async (p) => {
      if (p.usuarioId === usuarioId) throw new Error("provedor fora");
      return { enviados: 1, removidos: 0, falhas: 0 };
    });
    expect(await estado(id)).toEqual({ status: "falhou", erro: "provedor fora" });
  });
});
