import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor } from "../db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import { normalizarEventoApp } from "../vendas/eventos-app";
import { processarEventoApp } from "./app-eventos";
import { registrarMensagem } from "./ingestao";
import { criarProcessadorVendas, processarVenda, vincular } from "./vendas";

const db = () => getPoolMotor();
const HORA = 3600_000;
const processador = criarProcessadorVendas();

/** Lead com dono, criado pela ingestão como em vendas.db.test.ts. */
async function criarLead() {
  const telefone = telefoneUnico();
  const r = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone,
      nome: "Lead App",
      daEquipe: false,
      texto: "oi",
      tipoMidia: "texto",
      enviadaEm: new Date(Date.now() - 30 * 24 * HORA).toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  const vendedorId = await criarVendedor("Vendedor App");
  await db().query("update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid", [
    r.leadId,
    vendedorId,
  ]);
  return { leadId: r.leadId, telefone };
}

const enviar = (event: string, data: Record<string, unknown>) =>
  comTransacao((c) =>
    processador(c, {
      id: 1,
      origem: "vendas",
      corpo: { event, timestamp: new Date().toISOString(), data },
      tentativas: 0,
    }),
  );

const pago = (telefone: string, hours: number | null, transaction_id = randomUUID()) =>
  enviar("USER_HOUR_PURCHASE_PAID", {
    transaction_id,
    price_paid: 360,
    phone: telefone,
    ...(hours === null ? {} : { hours }),
  });

/** Data e horário em São Paulo para daqui a `ms`. */
function quando(ms: number) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(Date.now() + ms));
  const v = (t: string) => p.find((x) => x.type === t)?.value;
  return {
    date: `${v("year")}-${v("month")}-${v("day")}`,
    time_slot: `${v("hour")}:${v("minute")}`,
  };
}

const aula = (telefone: string, booking_id = randomUUID()) =>
  enviar("USER_LESSON_ATTENDED", { booking_id, phone: telefone, ...quando(-HORA) });

async function lead(id: string) {
  const { rows } = await db().query("select * from wakeclub.leads where id = $1::uuid", [id]);
  return rows[0];
}

async function eventosLead(id: string, tipo: string) {
  const { rows } = await db().query(
    `select agente, gatilho, estado_anterior, estado_novo, origem_id from wakeclub.eventos_automacao
      where lead_id = $1::uuid and tipo_evento = $2::text order by id`,
    [id, tipo],
  );
  return rows;
}

/** Agendamento processado com o relógio dos lembretes fixo em `agora` (SP é UTC-3 o ano todo). */
async function agendarEm(
  l: { leadId: string; telefone: string },
  quando: { agora: string; date: string; time_slot: string },
  booking_id = randomUUID(),
) {
  const { agora, date, time_slot } = quando;
  const ev = normalizarEventoApp({
    event: "USER_HOUR_BOOKED",
    timestamp: agora,
    data: { booking_id, phone: l.telefone, modality: "wake", date, time_slot },
  });
  if (!("tipo" in ev)) throw new Error(JSON.stringify(ev));
  return comTransacao((c) => processarEventoApp(c, ev, { booking_id }, { agora: new Date(agora) }));
}

async function followupsLembrete(id: string) {
  const { rows } = await db().query(
    `select tipo, status, aula_em, agendado_para, motivo from wakeclub.followups
      where lead_id = $1::uuid and tipo like 'lembrete%' order by tipo`,
    [id],
  );
  return rows;
}

async function appEvento(tipo: string, chave: string) {
  const { rows } = await db().query(
    "select * from wakeclub.app_eventos where tipo = $1::text and chave = $2::text",
    [tipo, chave],
  );
  return rows[0];
}

describe.skipIf(!bancoTesteAtivo)("eventos do app", () => {
  test("cadastro move Novo lead → Cadastrado, grava app_user_id e stage_changed agente app", async () => {
    const l = await criarLead();
    const userId = randomUUID();
    expect(await enviar("USER_CREATE_ACCOUNT", { user_id: userId, phone: l.telefone })).toBe(
      "processado",
    );
    const lido = await lead(l.leadId);
    expect(lido.etiqueta).toBe("Cadastrado");
    expect(lido.app_user_id).toBe(userId);
    const ev = await eventosLead(l.leadId, "stage_changed");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      agente: "app",
      gatilho: "webhook",
      estado_anterior: { etiqueta: "Novo lead" },
      estado_novo: { etiqueta: "Cadastrado" },
    });
    const ae = await appEvento("cadastro", userId);
    expect(ae.resultado).toBe("aplicado");
    expect(ae.lead_id).toBe(l.leadId);
    expect(ev[0].origem_id).toBe(String(ae.id));
  });

  test("compra_pendente → Aguardando pagamento com pagamento_pendente_desde; PAID depois → Aluno com horas, saldo = hours, pendente limpo", async () => {
    const l = await criarLead();
    await enviar("USER_HOUR_PURCHASE_CREATED", {
      payment_id: randomUUID(),
      phone: l.telefone,
      hours: 4,
    });
    let lido = await lead(l.leadId);
    expect(lido.etiqueta).toBe("Aguardando pagamento");
    expect(lido.pagamento_pendente_desde).not.toBeNull();
    await pago(l.telefone, 4);
    lido = await lead(l.leadId);
    expect(lido.etiqueta).toBe("Aluno com horas");
    expect(lido.saldo_horas).toBe(4);
    expect(lido.pagamento_pendente_desde).toBeNull();
  });

  test("PAID reentregue (mesma transaction_id) → 'ignorado', saldo não dobra, um só stage_changed", async () => {
    const l = await criarLead();
    const tx = randomUUID();
    expect(await pago(l.telefone, 3, tx)).toBe("processado");
    expect(await pago(l.telefone, 3, tx)).toBe("ignorado");
    expect((await lead(l.leadId)).saldo_horas).toBe(3);
    expect(await eventosLead(l.leadId, "stage_changed")).toHaveLength(1);
    expect(await eventosLead(l.leadId, "hours_balance_changed")).toHaveLength(1);
    const { rows } = await db().query(
      "select count(*)::int as n from wakeclub.vendas where id_externo = $1::text",
      [tx],
    );
    expect(rows[0].n).toBe(1);
  });

  test("aula sem compra: saldo fica null, resultado saldo_desconhecido, etapa não muda; com saldo 0: hora_sem_saldo, lesson_without_balance", async () => {
    const l = await criarLead();
    const b1 = randomUUID();
    await aula(l.telefone, b1);
    let lido = await lead(l.leadId);
    expect(lido.saldo_horas).toBeNull();
    expect(lido.etiqueta).toBe("Novo lead");
    expect(lido.ultima_aula_em).not.toBeNull();
    const { rows } = await db().query(
      "select resultado from wakeclub.app_eventos where tipo = 'aula' and chave like $1::text",
      [`${b1}|%`],
    );
    expect(rows[0].resultado).toBe("saldo_desconhecido");

    await db().query("update wakeclub.leads set saldo_horas = 0 where id = $1::uuid", [l.leadId]);
    const b2 = randomUUID();
    await aula(l.telefone, b2);
    lido = await lead(l.leadId);
    expect(lido.saldo_horas).toBe(0);
    expect(lido.etiqueta).toBe("Novo lead");
    const r2 = await db().query(
      "select resultado from wakeclub.app_eventos where tipo = 'aula' and chave like $1::text",
      [`${b2}|%`],
    );
    expect(r2.rows[0].resultado).toBe("hora_sem_saldo");
    expect(await eventosLead(l.leadId, "lesson_without_balance")).toHaveLength(2);
    expect(await eventosLead(l.leadId, "stage_changed")).toHaveLength(0);
  });

  test("duas aulas com saldo 2 → saldo 0 e Aluno sem horas; terceira → hora_sem_saldo", async () => {
    const l = await criarLead();
    await pago(l.telefone, 2);
    await aula(l.telefone);
    expect((await lead(l.leadId)).saldo_horas).toBe(1);
    await aula(l.telefone);
    let lido = await lead(l.leadId);
    expect(lido.saldo_horas).toBe(0);
    expect(lido.etiqueta).toBe("Aluno sem horas");
    const b3 = randomUUID();
    await aula(l.telefone, b3);
    lido = await lead(l.leadId);
    expect(lido.saldo_horas).toBe(0);
    expect(lido.etiqueta).toBe("Aluno sem horas");
    const { rows } = await db().query(
      "select resultado from wakeclub.app_eventos where tipo = 'aula' and chave like $1::text",
      [`${b3}|%`],
    );
    expect(rows[0].resultado).toBe("hora_sem_saldo");
  });

  test("Aluno sem horas + PAID 4h → Aluno com horas, saldo 4", async () => {
    const l = await criarLead();
    await db().query(
      "update wakeclub.leads set etiqueta = 'Aluno sem horas', saldo_horas = 0 where id = $1::uuid",
      [l.leadId],
    );
    await pago(l.telefone, 4);
    const lido = await lead(l.leadId);
    expect(lido.etiqueta).toBe("Aluno com horas");
    expect(lido.saldo_horas).toBe(4);
  });

  test("PAID sem hours → Aluno com horas com saldo null", async () => {
    const l = await criarLead();
    await pago(l.telefone, null);
    const lido = await lead(l.leadId);
    expect(lido.etiqueta).toBe("Aluno com horas");
    expect(lido.saldo_horas).toBeNull();
  });

  test("agendamento futuro cria lembrete_d1 e lembrete_dia pendentes com aula_em, não muda etapa, cancela 'parado' aberto; agendamento reentregue não duplica", async () => {
    const l = await criarLead();
    const parado = await db().query(
      `insert into wakeclub.followups (lead_id, agendado_para, tipo, status)
       values ($1::uuid, now(), 'parado', 'aguardando_aprovacao') returning id`,
      [l.leadId],
    );
    const booking_id = randomUUID();
    const agora = "2031-03-10T12:00:00-03:00";
    expect(await agendarEm(l, { agora, date: "2031-03-13", time_slot: "15:00" }, booking_id)).toBe(
      "processado",
    );
    expect(await agendarEm(l, { agora, date: "2031-03-13", time_slot: "15:00" }, booking_id)).toBe(
      "ignorado",
    );

    const lido = await lead(l.leadId);
    expect(lido.etiqueta).toBe("Novo lead");
    expect(lido.proxima_aula_em).not.toBeNull();
    const rows = await followupsLembrete(l.leadId);
    expect(rows.map((r) => [r.tipo, r.status])).toEqual([
      ["lembrete_d1", "pendente"],
      ["lembrete_dia", "pendente"],
    ]);
    for (const r of rows) {
      expect(new Date(r.aula_em).getTime()).toBe(new Date(lido.proxima_aula_em).getTime());
      expect(r.motivo).toMatch(/^aula em \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(wake\)$/);
    }
    expect(rows.map((r) => new Date(r.agendado_para).toISOString())).toEqual([
      "2031-03-12T13:00:00.000Z", // véspera 10:00 SP
      "2031-03-13T11:00:00.000Z", // dia 08:00 SP
    ]);
    const p = await db().query(
      "select status, motivo_cancelamento from wakeclub.followups where id = $1::uuid",
      [parado.rows[0].id],
    );
    expect(p.rows[0]).toEqual({
      status: "cancelado",
      motivo_cancelamento: "evento do app: agendamento",
    });
    expect(await eventosLead(l.leadId, "class_booked")).toHaveLength(1);
    expect(await eventosLead(l.leadId, "followup_cancelled")).toHaveLength(1);
    expect(await eventosLead(l.leadId, "followup_created")).toHaveLength(2);
    expect(await eventosLead(l.leadId, "stage_changed")).toHaveLength(0);
  });

  const lembretesEm = async (agora: string, date: string, time_slot: string) => {
    const l = await criarLead();
    await agendarEm(l, { agora, date, time_slot });
    return (await followupsLembrete(l.leadId)).map((r) => [
      r.tipo,
      new Date(r.agendado_para).toISOString(),
    ]);
  };

  test("agendamento daqui a 1h não cria lembrete", async () => {
    expect(await lembretesEm("2031-03-10T12:00:00-03:00", "2031-03-10", "13:00")).toEqual([]);
  });

  test("aula amanhã 07:00 agendada às 14:00 → só lembrete_d1, na hora do agendamento", async () => {
    expect(await lembretesEm("2031-03-10T14:00:00-03:00", "2031-03-11", "07:00")).toEqual([
      ["lembrete_d1", "2031-03-10T17:00:00.000Z"],
    ]);
  });

  test("aula hoje 18:00 agendada às 12:00 → só lembrete_dia, na hora do agendamento", async () => {
    expect(await lembretesEm("2031-03-10T12:00:00-03:00", "2031-03-10", "18:00")).toEqual([
      ["lembrete_dia", "2031-03-10T15:00:00.000Z"],
    ]);
  });

  test("agendado às 23:00 para amanhã 09:00 → nenhum (véspera passou das 20h, dia limita em 07:00)", async () => {
    expect(await lembretesEm("2031-03-10T23:00:00-03:00", "2031-03-11", "09:00")).toEqual([]);
  });

  test("PAID com user_id de outro lead: venda, horas e etapa vão para o lead do cpf/telefone; conflito marcado", async () => {
    const a = await criarLead();
    const b = await criarLead();
    const userId = randomUUID();
    await db().query("update wakeclub.leads set app_user_id = $2::text where id = $1::uuid", [
      b.leadId,
      userId,
    ]);
    const tx = randomUUID();
    await enviar("USER_HOUR_PURCHASE_PAID", {
      transaction_id: tx,
      price_paid: 360,
      phone: a.telefone,
      user_id: userId,
      hours: 3,
    });
    const { rows } = await db().query(
      "select lead_id from wakeclub.vendas where id_externo = $1::text",
      [tx],
    );
    expect(rows[0].lead_id).toBe(a.leadId);
    const la = await lead(a.leadId);
    expect(la.saldo_horas).toBe(3);
    expect(la.etiqueta).toBe("Aluno com horas");
    expect(la.app_user_id).toBeNull();
    const lb = await lead(b.leadId);
    expect(lb.saldo_horas).toBeNull();
    expect(lb.etiqueta).toBe("Novo lead");
    const ae = await appEvento("compra_paga", tx);
    expect(ae.lead_id).toBe(a.leadId);
    expect(ae.resultado).toBe("aplicado");
    expect(ae.dados.conflito_app_user_id).toBe(true);
  });

  test("evento com data.test 'true' → ignorado, sem app_eventos, etiqueta igual", async () => {
    const l = await criarLead();
    const userId = randomUUID();
    expect(
      await enviar("USER_CREATE_ACCOUNT", { user_id: userId, phone: l.telefone, test: "true" }),
    ).toBe("ignorado");
    expect(await appEvento("cadastro", userId)).toBeUndefined();
    expect((await lead(l.leadId)).etiqueta).toBe("Novo lead");
  });

  test("evento de pessoa desconhecida → app_eventos.resultado = 'sem_lead', lead_id null", async () => {
    const userId = randomUUID();
    expect(await enviar("USER_CREATE_ACCOUNT", { user_id: userId, phone: telefoneUnico() })).toBe(
      "processado",
    );
    const ae = await appEvento("cadastro", userId);
    expect(ae.resultado).toBe("sem_lead");
    expect(ae.lead_id).toBeNull();
  });

  test("Encerrado + PAID → Aluno com horas, saldo atualizado (ruling: quem pagou é aluno)", async () => {
    const l = await criarLead();
    await db().query("update wakeclub.leads set etiqueta = 'Encerrado' where id = $1::uuid", [
      l.leadId,
    ]);
    await pago(l.telefone, 2);
    const lido = await lead(l.leadId);
    expect(lido.etiqueta).toBe("Aluno com horas");
    expect(lido.saldo_horas).toBe(2);
  });

  test("vincular (admin) move o lead para Aluno com horas", async () => {
    const l = await criarLead();
    const { vendaId } = await comTransacao((c) =>
      processarVenda(
        c,
        {
          idExterno: `t-${randomUUID()}`,
          compradaEm: new Date().toISOString(),
          valor: 360,
          cpf: null,
          telefone: telefoneUnico(),
          produto: "Aula 1h",
          horas: 5,
          status: "paga",
          decisoes: [],
        },
        {},
      ),
    );
    expect((await lead(l.leadId)).etiqueta).toBe("Novo lead");
    await comTransacao((c) => vincular(c, vendaId, l.leadId, randomUUID()));
    const lido = await lead(l.leadId);
    expect(lido.etiqueta).toBe("Aluno com horas");
    expect(lido.saldo_horas).toBe(5);
    expect(await eventosLead(l.leadId, "stage_changed")).toHaveLength(1);
  });
});
