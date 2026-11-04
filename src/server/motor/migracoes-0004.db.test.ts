import { describe, expect, test } from "bun:test";

import { getPool, getPoolMotor, getPoolRw } from "../db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";

const CONFIG_ID = "00000000-0000-0000-0000-000000000001";

async function criarLead(): Promise<string> {
  const { rows } = await getPoolMotor().query<{ id: string }>(
    "insert into wakeclub.leads (telefone) values ($1::text) returning id",
    [telefoneUnico()],
  );
  return rows[0].id;
}

async function criarFollowup(leadId: string, status: string): Promise<string> {
  const { rows } = await getPoolMotor().query<{ id: string }>(
    `insert into wakeclub.followups (lead_id, agendado_para, tipo, status)
     values ($1::uuid, now(), 'reengajar', $2::text) returning id`,
    [leadId, status],
  );
  return rows[0].id;
}

describe.skipIf(!bancoTesteAtivo)("migração 0004", () => {
  test("configuracoes tem ritmo e preco_hora, com os grants do painel", async () => {
    const { rows } = await getPoolMotor().query<{ chave: string; valor: unknown }>(
      `select chave, valor from wakeclub.configuracoes
        where chave in ('ritmo', 'preco_hora') order by chave`,
    );
    expect(rows).toEqual([
      { chave: "preco_hora", valor: 360 },
      { chave: "ritmo", valor: { modo: "conservador" } },
    ]);
    const ro = await getPool().query("select chave from wakeclub.configuracoes");
    expect(ro.rowCount).toBeGreaterThanOrEqual(2);
    const rw = await getPoolRw().query(
      "update wakeclub.configuracoes set valor = valor where chave = 'preco_hora'",
    );
    expect(rw.rowCount).toBe(1);
  });

  test("followups aceita aguardando_aprovacao e rejeita status desconhecido", async () => {
    const leadId = await criarLead();
    expect(await criarFollowup(leadId, "aguardando_aprovacao")).toBeString();
    const erro = await criarFollowup(await criarLead(), "xyz").catch((e: { code?: string }) => e);
    expect((erro as { code?: string }).code).toBe("23514");
  });

  test("um follow-up aberto por lead cobre aguardando_aprovacao e aprovado", async () => {
    const leadId = await criarLead();
    await criarFollowup(leadId, "aprovado");
    const erro = await criarFollowup(leadId, "pendente").catch((e: { code?: string }) => e);
    expect((erro as { code?: string }).code).toBe("23505");
    // Fechado não conta.
    const outro = await criarLead();
    await criarFollowup(outro, "expirado");
    expect(await criarFollowup(outro, "pendente")).toBeString();
  });

  test("motor insere avaliação e mensagem ligada ao follow-up", async () => {
    const usuarioId = await criarVendedor("Avaliadora");
    const leadId = await criarLead();
    const followupId = await criarFollowup(leadId, "aguardando_aprovacao");
    const motor = getPoolMotor();
    await motor.query(
      `insert into wakeclub.followup_avaliacoes
         (followup_id, usuario_id, decisao, motivos, texto_original, texto_enviado)
       values ($1::uuid, $2::uuid, 'enviar', $3::text[], 'oi', 'oi!')`,
      [followupId, usuarioId, ["Ajustei o texto"]],
    );
    const { rows } = await motor.query<{ motivos: string[] }>(
      "select motivos from wakeclub.followup_avaliacoes where followup_id = $1::uuid",
      [followupId],
    );
    expect(rows).toEqual([{ motivos: ["Ajustei o texto"] }]);
    const recusa = await motor
      .query(
        `insert into wakeclub.followup_avaliacoes (followup_id, usuario_id, decisao)
         values ($1::uuid, $2::uuid, 'talvez')`,
        [followupId, usuarioId],
      )
      .catch((e: { code?: string }) => e);
    expect((recusa as { code?: string }).code).toBe("23514");
    await motor.query(
      `insert into wakeclub.mensagens (lead_id, direcao, texto, enviada_em, followup_id)
       values ($1::uuid, 'equipe', 'oi!', now(), $2::uuid)`,
      [leadId, followupId],
    );
  });

  test("evento de configuração sem lead", async () => {
    await getPoolMotor().query(
      `insert into wakeclub.eventos_automacao
         (agente, tipo_evento, entidade_tipo, entidade_id, origem_tipo, correlacao_id)
       values ('sistema', 'rhythm_reset', 'config', $1::uuid, 'motor', $2::text)`,
      [CONFIG_ID, `teste:${crypto.randomUUID()}`],
    );
    const erro = await getPoolMotor()
      .query(
        `insert into wakeclub.eventos_automacao
           (agente, tipo_evento, entidade_tipo, entidade_id, origem_tipo, correlacao_id)
         values ('sistema', 'x', 'lead', $1::uuid, 'motor', $2::text)`,
        [CONFIG_ID, `teste:${crypto.randomUUID()}`],
      )
      .catch((e: { code?: string }) => e);
    expect((erro as { code?: string }).code).toBe("23514");
  });
});
