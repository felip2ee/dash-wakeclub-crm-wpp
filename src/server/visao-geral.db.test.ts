import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor } from "./db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";
import { lerAlertas } from "./visao-geral";
import { enfileirar } from "./webhooks/receber";

const db = () => getPoolMotor();

async function leadDe(dono: string): Promise<string> {
  const { leadId } = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone: telefoneUnico(),
      nome: "Lead Alerta",
      daEquipe: false,
      texto: "oi",
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  await db().query("update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid", [
    leadId,
    dono,
  ]);
  return leadId;
}

/** Lead novo do dono com um só follow-up (o índice permite um aberto por lead). */
async function followup(dono: string, status: string, agendadoHa: string) {
  const leadId = await leadDe(dono);
  // A ingestão já agenda um `pendente`; ele sai para o teste controlar a contagem.
  await db().query(
    "update wakeclub.followups set status = 'cancelado' where lead_id = $1::uuid and status = 'pendente'",
    [leadId],
  );
  await db().query(
    `insert into wakeclub.followups (lead_id, agendado_para, tipo, status)
     values ($1::uuid, now() - $3::interval, 'reengajar', $2::text)`,
    [leadId, status, agendadoHa],
  );
}

describe.skipIf(!bancoTesteAtivo)("alertas da visão geral no banco", () => {
  test("conta aprovações e follow-ups vencidos há mais de 2 dias do vendedor", async () => {
    const dono = await criarVendedor("Dono Alertas");
    await followup(dono, "pendente", "3 days"); // em atraso
    await followup(dono, "pendente", "1 day"); // vencido, mas dentro da folga de 2 dias
    await followup(dono, "aguardando_aprovacao", "0 days");
    await followup(dono, "enviado", "5 days"); // já saiu, não conta

    const alertas = await lerAlertas(db(), dono);
    expect(alertas.aprovacoesPendentes).toBe(1);
    expect(alertas.followupsEmAtraso).toBe(1);

    // Sem filtro, o vendedor novo entra na conta geral.
    const geral = await lerAlertas(db(), null);
    expect(geral.aprovacoesPendentes).toBeGreaterThanOrEqual(1);
    expect(geral.followupsEmAtraso).toBeGreaterThanOrEqual(1);
  });

  test("falhas da fila contam todas, sem o limite de 50 do monitor", async () => {
    const antes = (await lerAlertas(db(), null)).filaFalhas;
    const id = await enfileirar(db(), "evolution", { n: "x" }, `t6-${randomUUID()}`);
    await db().query(
      "update wakeclub.webhook_eventos set status = 'falhou' where id = $1::bigint",
      [id],
    );
    expect((await lerAlertas(db(), null)).filaFalhas).toBe(antes + 1);
  });
});
