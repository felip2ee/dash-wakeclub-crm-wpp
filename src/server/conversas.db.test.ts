import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { leadsComSugestao, lerLinhaDoTempo, lerMensagens } from "./conversas";
import { comTransacao, getPool, getPoolMotor } from "./db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";

const db = () => getPoolMotor();

async function lead(tipoMidia: "texto" | "audio" | "imagem" = "texto") {
  const dono = await criarVendedor("Dona");
  const { leadId } = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone: telefoneUnico(),
      nome: "Lead Linha",
      daEquipe: false,
      texto: tipoMidia === "audio" ? "" : tipoMidia === "imagem" ? "[imagem]" : "oi",
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
    expect(r.midias).toEqual({});
    expect(r.compras).toEqual([]);
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
    expect(r.midias).toEqual({});
  });

  test("imagem aparece em midias com o tipo", async () => {
    const { leadId } = await lead("imagem");
    const r = await lerLinhaDoTempo(db(), leadId, null);
    expect(Object.values(r.midias)).toEqual(["imagem"]);
    expect(r.audios).toEqual({});
  });

  test("venda paga do lead entra em compras; estornada não", async () => {
    const { leadId } = await lead();
    await db().query(
      `insert into wakeclub.vendas (id_externo, comprada_em, valor, produto, horas, status, lead_id)
       values ('teste:' || gen_random_uuid()::text, '2026-01-15T12:00:00Z', 300, 'Wakeboard 1h', 1, 'paga', $1::uuid),
              ('teste:' || gen_random_uuid()::text, '2026-01-16T12:00:00Z', 600, null, 2, 'estornada', $1::uuid)`,
      [leadId],
    );
    const r = await lerLinhaDoTempo(db(), leadId, null);
    expect(r.compras).toEqual([
      { compradaEm: "2026-01-15T12:00:00.000Z", produto: "Wakeboard 1h", horas: 1 },
    ]);
  });

  test("atendente que não é dona não lê o lead", async () => {
    const { leadId } = await lead();
    const outra = await criarVendedor("Outra");
    await expect(lerLinhaDoTempo(db(), leadId, outra)).rejects.toThrow("Lead não encontrado.");
  });
});

// scripts/banco-teste.sh só aplica migrações; as views do painel (db/painel-views.sql)
// entram à mão no contêiner descartável. Sem elas, o teste é pulado.
const temViewsDoPainel =
  bancoTesteAtivo &&
  (
    await getPool().query<{ ok: boolean }>(
      "select to_regclass('wakeclub.v_mensagens_painel') is not null as ok",
    )
  ).rows[0].ok;

describe.skipIf(!temViewsDoPainel)("lerMensagens", () => {
  test("com limite, só as mais recentes, em ordem cronológica; sem limite, todas", async () => {
    const { leadId } = await lead();
    const { rows } = await db().query<{ telefone: string }>(
      "select telefone from wakeclub.leads where id = $1::uuid",
      [leadId],
    );
    const base = Date.now();
    for (const i of [1, 2, 3]) {
      await comTransacao((c) =>
        registrarMensagem(c, {
          tipo: "mensagem",
          telefone: rows[0].telefone,
          nome: "Lead Linha",
          daEquipe: false,
          texto: `m${i}`,
          tipoMidia: "texto",
          enviadaEm: new Date(base + i * 1000).toISOString(),
          evolutionMsgId: randomUUID(),
        }),
      );
    }

    const ultimas = await lerMensagens(getPool(), leadId, 2);
    expect(ultimas.map((m) => m.texto)).toEqual(["m2", "m3"]);
    const todas = await lerMensagens(getPool(), leadId, null);
    expect(todas.map((m) => m.texto)).toEqual(["oi", "m1", "m2", "m3"]);
  });
});
