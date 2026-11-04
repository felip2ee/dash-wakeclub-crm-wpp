import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor } from "../db";
import { clienteIaFalso } from "../ia/falso";
import type { ClienteIa } from "../ia/tipos";
import { VERSAO_PROMPT } from "../ia/prompts/qualificador";
import { bancoTesteAtivo, telefoneUnico } from "./banco-teste";
import { registrarMensagem } from "./ingestao";
import { tarefaQualificador } from "./qualificador";

const db = () => getPoolMotor();

// Lead vencido há um dia: fica à frente de qualquer outro lead vencido do banco de teste.
async function leadVencido(texto = "quero uma aula de 4h no sábado"): Promise<string> {
  const r = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone: telefoneUnico(),
      nome: "Lead Qualificador",
      daEquipe: false,
      texto,
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  await db().query(
    "update wakeclub.leads set qualificar_apos = now() - interval '1 day' where id = $1::uuid",
    [r.leadId],
  );
  return r.leadId;
}

async function carimbo(intervalo: string): Promise<string> {
  const { rows } = await db().query<{ c: string }>(
    `select to_char((now() + $1::interval) at time zone 'America/Sao_Paulo',
                    'YYYY-MM-DD HH24:MI') as c`,
    [intervalo],
  );
  return rows[0].c;
}

async function lead(id: string) {
  const { rows } = await db().query(
    `select etiqueta, temperatura, resumo, horas_estimadas, qualificar_apos,
            qualificar_apos > now() + interval '9 minutes' as reagendado
       from wakeclub.leads where id = $1::uuid`,
    [id],
  );
  return rows[0];
}

async function eventos(leadId: string) {
  const { rows } = await db().query(
    `select tipo_evento, entidade_tipo, origem_tipo, correlacao_id, modelo, versao_prompt
       from wakeclub.eventos_automacao
      where lead_id = $1::uuid and agente = 'qualificador'
      order by id`,
    [leadId],
  );
  return rows;
}

async function followups(leadId: string) {
  const { rows } = await db().query(
    `select id, status, tipo, motivo,
            to_char(agendado_para at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as quando
       from wakeclub.followups where lead_id = $1::uuid order by criado_em`,
    [leadId],
  );
  return rows;
}

const resposta = (extra: Record<string, unknown> = {}) => ({
  etiqueta: "Agendado",
  temperatura: "quente",
  interesse: "aula 4h",
  objecao: null,
  data_agendada: null,
  resumo: "Quer aula de 4h no sábado.",
  justificativa_curta: "pediu aula de 4h",
  followup: null,
  horas_estimadas: 4,
  ...extra,
});

/** IA que só responde ao lead da `marca` e roda `durante` antes de responder (no meio da IA). */
function iaDoLead(marca: string, durante: () => Promise<void>): ClienteIa {
  return {
    async chatJson<T>(p: { usuario: string }) {
      if (!p.usuario.includes(marca)) throw new Error("outro lead");
      await durante();
      return resposta() as T;
    },
    transcrever: async () => "",
  };
}

const minutosAte = async (id: string) => {
  const { rows } = await db().query<{ m: number | null }>(
    `select extract(epoch from qualificar_apos - now()) / 60 as m
       from wakeclub.leads where id = $1::uuid`,
    [id],
  );
  return rows[0].m === null ? null : Number(rows[0].m);
};

describe.skipIf(!bancoTesteAtivo)("qualificador", () => {
  test("lead reivindicado e não gravado volta em 15 min", async () => {
    const marca = randomUUID();
    const id = await leadVencido("quero aula " + marca);
    let duranteIa: number | null = -1;
    await tarefaQualificador({
      ia: iaDoLead(marca, async () => void (duranteIa = await minutosAte(id))),
    });
    // Se o processo cair aqui, o lead não some da fila: volta quando o lease vencer.
    expect(duranteIa).toBeGreaterThan(14);
    expect(duranteIa).toBeLessThanOrEqual(15);
    expect(await minutosAte(id)).toBeNull();
  });

  test("mensagem durante a IA mantém qualificar_apos novo", async () => {
    const marca = randomUUID();
    const id = await leadVencido("quero aula " + marca);
    const { rows } = await db().query<{ telefone: string }>(
      "select telefone from wakeclub.leads where id = $1::uuid",
      [id],
    );
    const ia = iaDoLead(marca, async () => {
      await comTransacao((c) =>
        registrarMensagem(c, {
          tipo: "mensagem",
          telefone: rows[0].telefone,
          nome: null,
          daEquipe: false,
          texto: "e no domingo?",
          tipoMidia: "texto",
          enviadaEm: new Date().toISOString(),
          evolutionMsgId: randomUUID(),
        }),
      );
    });
    await tarefaQualificador({ ia });
    const m = await minutosAte(id);
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(2);
  });

  test("falha com mensagem durante a IA mantém o +2 min", async () => {
    const marca = randomUUID();
    const id = await leadVencido("quero aula " + marca);
    const ia = iaDoLead(marca, async () => {
      await db().query(
        "update wakeclub.leads set qualificar_apos = now() + interval '2 minutes' where id = $1::uuid",
        [id],
      );
      throw new Error("timeout");
    });
    await tarefaQualificador({ ia });
    expect(await minutosAte(id)).toBeLessThanOrEqual(2);
  });

  test("qualifica e grava eventos", async () => {
    const id = await leadVencido();
    const quando = await carimbo("2 days");
    const ia = clienteIaFalso({
      chat: [resposta({ followup: { quando, tipo: "reengajar", motivo: "confirmar sábado" } })],
    });

    await tarefaQualificador({ ia });

    const p = ia.chamadas.chat[0];
    expect(p.modelo).toBe("gpt-5.4-mini");
    expect(p.nomeSchema).toBe("qualificacao");
    expect(p.reasoningEffort).toBe("low");
    expect(p.timeoutMs).toBe(60000);
    expect(p.usuario).toContain("LEAD: quero uma aula de 4h no sábado");

    const l = await lead(id);
    expect(l).toMatchObject({
      etiqueta: "Agendado",
      temperatura: "quente",
      resumo: "Quer aula de 4h no sábado.",
      horas_estimadas: 4,
      qualificar_apos: null,
    });

    const evs = await eventos(id);
    // A ordem entre CTEs da mesma instrução não é garantida; o followup vem na seguinte.
    expect(evs.map((e) => e.tipo_evento).sort()).toEqual([
      "followup_created",
      "lead_qualified",
      "stage_changed",
      "temperature_changed",
    ]);
    const criado = evs.find((e) => e.tipo_evento === "followup_created");
    for (const e of evs) {
      expect(e.origem_tipo).toBe("motor");
      expect(e.correlacao_id).toStartWith("motor:qual:");
      expect(e.modelo).toBe("gpt-5.4-mini");
      expect(e.versao_prompt).toBe(VERSAO_PROMPT);
    }

    const fs = await followups(id);
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ status: "pendente", tipo: "reengajar", quando });
    expect(criado?.correlacao_id).toEndWith(":" + fs[0].id);
  });

  test("falha reagenda +10 min", async () => {
    const id = await leadVencido();
    const ia = clienteIaFalso({ chat: [new Error("timeout"), { resumo: "" }] });

    await tarefaQualificador({ ia });
    expect((await lead(id)).reagendado).toBe(true);

    await db().query(
      "update wakeclub.leads set qualificar_apos = now() - interval '1 day' where id = $1::uuid",
      [id],
    );
    await tarefaQualificador({ ia });
    const l = await lead(id);
    expect(l.reagendado).toBe(true);
    expect(l.resumo).toBeNull();
    expect(await eventos(id)).toEqual([]);
  });

  test("nao requalifica opt_out", async () => {
    const id = await leadVencido();
    await db().query("update wakeclub.leads set opt_out = true where id = $1::uuid", [id]);
    const ia = clienteIaFalso({ chat: [] });

    await tarefaQualificador({ ia });

    expect((await lead(id)).qualificar_apos).not.toBeNull();
    expect(await eventos(id)).toEqual([]);
  });

  test("segundo followup nao duplica pendente", async () => {
    const id = await leadVencido();
    const f = (motivo: string) => ({ quando: "2000-01-01 00:00", tipo: "reengajar", motivo });
    const ia = clienteIaFalso({
      chat: [resposta({ followup: f("primeiro") }), resposta({ followup: f("segundo") })],
    });

    await tarefaQualificador({ ia });
    await db().query(
      "update wakeclub.leads set qualificar_apos = now() - interval '1 day' where id = $1::uuid",
      [id],
    );
    await tarefaQualificador({ ia });

    const fs = await followups(id);
    expect(fs.map((x) => [x.status, x.motivo])).toEqual([
      ["cancelado", "primeiro"],
      ["pendente", "segundo"],
    ]);
    // Data antes do mínimo vira o mínimo (now() + 30 min).
    expect(fs[1].quando >= (await carimbo("29 minutes"))).toBe(true);
    const tipos = (await eventos(id)).map((e) => e.tipo_evento);
    expect(tipos.filter((t) => t === "followup_cancelled")).toHaveLength(1);
    expect(tipos.filter((t) => t === "followup_created")).toHaveLength(2);
  });

  test("aguardando aprovação é cancelado na requalificação e enviando bloqueia novo", async () => {
    const id = await leadVencido();
    const f = { quando: "2000-01-01 00:00", tipo: "reengajar", motivo: "m" };
    const ia = clienteIaFalso({
      chat: [resposta({ followup: f }), resposta({ followup: f }), resposta({ followup: f })],
    });
    const vencer = () =>
      db().query(
        "update wakeclub.leads set qualificar_apos = now() - interval '1 day' where id = $1::uuid",
        [id],
      );
    const status = (s: string) =>
      db().query(
        "update wakeclub.followups set status = $2::text where lead_id = $1::uuid and status = 'pendente'",
        [id, s],
      );

    await tarefaQualificador({ ia });
    await status("aguardando_aprovacao");
    await vencer();
    await tarefaQualificador({ ia });
    expect((await followups(id)).map((x) => x.status)).toEqual(["cancelado", "pendente"]);

    await status("enviando");
    await vencer();
    await tarefaQualificador({ ia });
    expect((await followups(id)).map((x) => x.status)).toEqual(["cancelado", "enviando"]);
    expect((await lead(id)).qualificar_apos).toBeNull();
  });
});
