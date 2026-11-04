import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { leadsComSugestao, lerLinhaDoTempo } from "./conversas";
import { comTransacao, getPoolMotor } from "./db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";

const db = () => getPoolMotor();

async function lead(tipoMidia: "texto" | "audio" = "texto") {
  const dono = await criarVendedor("Dona");
  const { leadId } = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone: telefoneUnico(),
      nome: "Lead Linha",
      daEquipe: false,
      texto: tipoMidia === "audio" ? "" : "oi",
      tipoMidia,
      enviadaEm: new Date().toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  await db().query("update wakeclub.leads set atendente_id = $2::uuid where id = $1::uuid", [
    leadId,
    dono,
  ]);
  return { leadId, dono };
}

async function evento(leadId: string, tipo: string, de: string | null, para: string | null) {
  await db().query(
    `insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, estado_anterior, estado_novo,
        entidade_tipo, entidade_id, correlacao_id)
     values ($1::uuid, 'teste', $2::text,
             jsonb_strip_nulls(jsonb_build_object('etiqueta', $3::text)),
             jsonb_strip_nulls(jsonb_build_object('etiqueta', $4::text)),
             'lead', $1::uuid, 'teste:' || gen_random_uuid()::text)`,
    [leadId, tipo, de, para],
  );
}

describe.skipIf(!bancoTesteAtivo)("lerLinhaDoTempo", () => {
  test("lead sem eventos: só o cadastro, sem sugestão", async () => {
    const { leadId } = await lead();
    const r = await lerLinhaDoTempo(db(), leadId, null);
    expect(typeof r.criadoEm).toBe("string");
    expect(r.eventos).toEqual([]);
    expect(r.sugestao).toBeNull();
    expect(r.audios).toEqual({});
  });

  test("etapa e follow-up enviado, sem outros tipos; sugestão aguardando aprovação", async () => {
    const { leadId, dono } = await lead();
    await evento(leadId, "stage_changed", "Novo Lead", "Atendimento");
    await evento(leadId, "followup_sent", null, null);
    await evento(leadId, "lead_qualified", null, null);
    const { rows } = await db().query<{ id: string }>(
      `insert into wakeclub.followups (lead_id, agendado_para, tipo, status, texto_sugerido)
       values ($1::uuid, now(), 'reengajar', 'aguardando_aprovacao', 'Oi, tudo bem?')
       returning id`,
      [leadId],
    );

    const r = await lerLinhaDoTempo(db(), leadId, dono);
    expect(r.eventos.map((e) => [e.tipo, e.de, e.para])).toEqual([
      ["stage_changed", "Novo Lead", "Atendimento"],
      ["followup_sent", null, null],
    ]);
    expect(r.eventos[0].ocorridoEm).toMatch(/Z$/);
    expect(r.sugestao).toEqual({ followupId: rows[0].id, texto: "Oi, tudo bem?", modo: null });

    expect((await leadsComSugestao(db(), dono)).has(leadId)).toBe(true);
    expect((await leadsComSugestao(db(), null)).has(leadId)).toBe(true);
    expect((await leadsComSugestao(db(), randomUUID())).has(leadId)).toBe(false);
  });

  test("áudio aparece com o status da transcrição", async () => {
    const { leadId } = await lead("audio");
    const r = await lerLinhaDoTempo(db(), leadId, null);
    expect(Object.values(r.audios)).toEqual(["pendente"]);
  });

  test("atendente que não é dona não lê o lead", async () => {
    const { leadId } = await lead();
    const outra = await criarVendedor("Outra");
    await expect(lerLinhaDoTempo(db(), leadId, outra)).rejects.toThrow("Lead não encontrado.");
  });
});
