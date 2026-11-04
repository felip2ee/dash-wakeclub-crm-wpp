import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor, getPoolRw } from "../db";
import type { AdaptadorEvolution, EventoMensagem } from "../evolution/tipos";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import { criarProcessadorEvolution, registrarMensagem } from "./ingestao";

const db = () => getPoolMotor();

function msg(extra: Partial<EventoMensagem> = {}): EventoMensagem {
  return {
    tipo: "mensagem",
    telefone: telefoneUnico(),
    nome: "Lead Teste",
    daEquipe: false,
    texto: "oi, quanto custa a aula?",
    tipoMidia: "texto",
    enviadaEm: new Date().toISOString(),
    evolutionMsgId: randomUUID(),
    ...extra,
  };
}

const registrar = (m: EventoMensagem) => comTransacao((c) => registrarMensagem(c, m));

async function lead(id: string) {
  const { rows } = await db().query(
    `select nome, etiqueta, opt_out, n_toques, qualificar_apos, ultima_msg_lead_em,
            ultima_msg_equipe_em
       from wakeclub.leads where id = $1::uuid`,
    [id],
  );
  return rows[0];
}

async function criarFollowup(leadId: string) {
  const { rows } = await db().query(
    `insert into wakeclub.followups (lead_id, agendado_para, tipo)
     values ($1::uuid, now() + interval '1 day', 'reengajar') returning id`,
    [leadId],
  );
  return rows[0].id as string;
}

async function followup(id: string) {
  const { rows } = await db().query(
    "select status, motivo_cancelamento from wakeclub.followups where id = $1::uuid",
    [id],
  );
  return rows[0];
}

async function eventosOptOut(leadId: string) {
  const { rows } = await db().query(
    `select estado_novo from wakeclub.eventos_automacao
      where entidade_id = $1::uuid and tipo_evento = 'opt_out'`,
    [leadId],
  );
  return rows;
}

async function eventosFollowupSent(followupId: string) {
  const { rows } = await db().query(
    `select metadados from wakeclub.eventos_automacao
      where entidade_id = $1::uuid and tipo_evento = 'followup_sent'`,
    [followupId],
  );
  return rows;
}

// A role do motor não insere em followup_toques; quem insere no app é a painel_rw.
async function criarToque(followupId: string, usuarioId: string, atras: string) {
  await getPoolRw().query(
    `insert into wakeclub.followup_toques (followup_id, usuario_id, aberto_em)
     values ($1::uuid, $2::uuid, now() - $3::interval)`,
    [followupId, usuarioId, atras],
  );
}

describe.skipIf(!bancoTesteAtivo)("entrada de mensagens", () => {
  test("lead novo e mensagem", async () => {
    const m = msg();
    const r = await registrar(m);
    expect(r.nova).toBe(true);
    expect((await lead(r.leadId)).nome).toBe("Lead Teste");
    const { rows } = await db().query(
      "select direcao, texto, tipo, enviada_por from wakeclub.mensagens where id = $1::uuid",
      [r.mensagemId],
    );
    expect(rows[0]).toEqual({ direcao: "lead", texto: m.texto, tipo: "texto", enviada_por: null });
  });

  test("idempotente por evolution_msg_id", async () => {
    const m = msg();
    const primeira = await registrar(m);
    const antes = await lead(primeira.leadId);
    const segunda = await registrar(m);
    expect(segunda).toEqual({ leadId: primeira.leadId, mensagemId: null, nova: false });
    expect((await lead(primeira.leadId)).qualificar_apos).toEqual(antes.qualificar_apos);
    const { rows } = await db().query(
      "select count(*)::int as n from wakeclub.mensagens where evolution_msg_id = $1::text",
      [m.evolutionMsgId],
    );
    expect(rows[0].n).toBe(1);
  });

  test("opt-out encerra", async () => {
    const telefone = telefoneUnico();
    const { leadId } = await registrar(msg({ telefone }));
    const f = await criarFollowup(leadId);
    await registrar(msg({ telefone, texto: "parar" }));
    const l = await lead(leadId);
    expect([l.opt_out, l.etiqueta, l.qualificar_apos]).toEqual([
      true,
      "Negociação encerrada",
      null,
    ]);
    expect(await followup(f)).toEqual({
      status: "cancelado",
      motivo_cancelamento: "opt-out: o lead pediu para parar",
    });
    const { rows } = await db().query(
      `select count(*)::int as n from wakeclub.eventos_automacao
        where entidade_id = $1::uuid and tipo_evento = 'followup_cancelled'`,
      [f],
    );
    expect(rows[0].n).toBe(1);
    expect(await eventosOptOut(leadId)).toMatchObject([
      { estado_novo: { opt_out: true, etiqueta: "Negociação encerrada", qualificar_apos: null } },
    ]);
  });

  test("segundo opt-out nao gera evento de novo", async () => {
    const telefone = telefoneUnico();
    const { leadId } = await registrar(msg({ telefone }));
    await registrar(msg({ telefone, texto: "parar" }));
    await registrar(msg({ telefone, texto: "parar" }));
    expect(await eventosOptOut(leadId)).toHaveLength(1);
  });

  test("eco da equipe dentro da janela do toque gera followup_sent", async () => {
    const telefone = telefoneUnico();
    const { leadId } = await registrar(msg({ telefone }));
    const f = await criarFollowup(leadId);
    const vendedor = await criarVendedor("Toque");
    await criarToque(f, vendedor, "10 minutes");
    await registrar(msg({ telefone, daEquipe: true, nome: null, texto: "oi, tudo bem?" }));
    const ev = await eventosFollowupSent(f);
    expect(ev).toHaveLength(1);
    expect(ev[0].metadados.usuario_id).toBe(vendedor);
    expect((await followup(f)).status).toBe("cancelado");
  });

  test("toque fora da janela nao gera followup_sent", async () => {
    const telefone = telefoneUnico();
    const { leadId } = await registrar(msg({ telefone }));
    const f = await criarFollowup(leadId);
    await criarToque(f, await criarVendedor("Toque Velho"), "2 hours");
    await registrar(msg({ telefone, daEquipe: true, nome: null, texto: "oi" }));
    expect(await eventosFollowupSent(f)).toHaveLength(0);
  });

  test("conversa viva cancela followup", async () => {
    const telefone = telefoneUnico();
    const { leadId } = await registrar(msg({ telefone }));
    const f = await criarFollowup(leadId);
    await registrar(msg({ telefone, daEquipe: true, nome: null, texto: "bom dia!" }));
    expect(await followup(f)).toEqual({
      status: "cancelado",
      motivo_cancelamento: "conversa viva: houve movimento",
    });
  });

  test("mensagem do lead zera n_toques e agenda +2 min", async () => {
    const telefone = telefoneUnico();
    const { leadId } = await registrar(msg({ telefone }));
    await db().query("update wakeclub.leads set n_toques = 3 where id = $1::uuid", [leadId]);
    await registrar(msg({ telefone }));
    const l = await lead(leadId);
    expect(l.n_toques).toBe(0);
    const minutos = (new Date(l.qualificar_apos).getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(1.5);
    expect(minutos).toBeLessThan(2.5);
  });

  test("audio entra pendente", async () => {
    const r = await registrar(msg({ tipoMidia: "audio", texto: "[audio]" }));
    const { rows } = await db().query(
      "select transcricao_status from wakeclub.mensagens where id = $1::uuid",
      [r.mensagemId],
    );
    expect(rows[0].transcricao_status).toBe("pendente");
  });

  test("fromMe fora do app vira celular", async () => {
    const r = await registrar(msg({ daEquipe: true, nome: "Nome do Celular" }));
    const { rows } = await db().query(
      "select direcao, enviada_por, usuario_id from wakeclub.mensagens where id = $1::uuid",
      [r.mensagemId],
    );
    expect(rows[0]).toEqual({ direcao: "equipe", enviada_por: "celular", usuario_id: null });
    const l = await lead(r.leadId);
    expect(l.nome).toBeNull();
    expect(l.ultima_msg_equipe_em).not.toBeNull();
    expect(l.ultima_msg_lead_em).toBeNull();
  });

  test("processador aplica eventos normalizados e ignora o resto", async () => {
    const m = msg();
    const adaptador = {
      normalizar: (corpo: unknown) =>
        (corpo as { vazio?: boolean }).vazio ? [{ tipo: "ignorar", motivo: "grupo" }] : [m],
    } as unknown as AdaptadorEvolution;
    const processar = criarProcessadorEvolution(adaptador);
    const evento = (corpo: unknown) => ({ id: 0, origem: "evolution", corpo, tentativas: 0 });
    expect(await comTransacao((c) => processar(c, evento({})))).toBe("processado");
    expect(await comTransacao((c) => processar(c, evento({ vazio: true })))).toBe("ignorado");
    const { rows } = await db().query(
      "select count(*)::int as n from wakeclub.mensagens where evolution_msg_id = $1::text",
      [m.evolutionMsgId],
    );
    expect(rows[0].n).toBe(1);
  });

  test("processador atribui dono so para mensagem do lead", async () => {
    await criarVendedor("Vera");
    const doLead = msg();
    const daEquipe = msg({ daEquipe: true, nome: null });
    const adaptador = { normalizar: (c: unknown) => [c] } as unknown as AdaptadorEvolution;
    const processar = criarProcessadorEvolution(adaptador);
    for (const m of [doLead, daEquipe]) {
      await comTransacao((c) =>
        processar(c, { id: 0, origem: "evolution", corpo: m, tentativas: 0 }),
      );
    }
    const { rows } = await db().query(
      `select telefone, atendente_id is not null as tem_dono from wakeclub.leads
        where telefone = any($1::text[]) order by telefone`,
      [[doLead.telefone, daEquipe.telefone]],
    );
    const porTelefone = Object.fromEntries(rows.map((r) => [r.telefone, r.tem_dono]));
    expect(porTelefone).toEqual({ [doLead.telefone]: true, [daEquipe.telefone]: false });
  });
});
