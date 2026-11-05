import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor } from "./db";
import { lerFilaEnvio, removerDaFila } from "./fila-envio";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";

const db = () => getPoolMotor();

async function lead(): Promise<string> {
  const { leadId } = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone: telefoneUnico(),
      nome: "Lead Fila",
      daEquipe: false,
      texto: "oi",
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  return leadId;
}

async function followup(
  leadId: string,
  admin: string,
  tipo: string,
  comAula = false,
): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `insert into wakeclub.followups
       (lead_id, agendado_para, tipo, status, texto_enviado, aprovado_por, aprovado_em
        ${comAula ? ", aula_em" : ""})
     values ($1::uuid, now(), $2::text, 'aprovado', 'Oi', $3::uuid, now()
             ${comAula ? ", now() + interval '1 day'" : ""})
     returning id`,
    [leadId, tipo, admin],
  );
  return rows[0].id;
}

describe.skipIf(!bancoTesteAtivo)("fila de envio no banco", () => {
  test("previsão, saem hoje, lembrete primeiro e remoção", async () => {
    const admin = await criarVendedor("Admin Fila");
    // Fila isolada: tudo que sobrou de outros testes sai do caminho.
    await db().query(
      `update wakeclub.followups set status = 'cancelado' where status = 'aprovado'`,
    );
    await db().query(
      `update wakeclub.followups set enviado_em = now() - interval '2 days' where status = 'enviado'`,
    );
    for (let i = 0; i < 19; i++) {
      await db().query(
        `insert into wakeclub.followups
           (lead_id, agendado_para, tipo, status, texto_enviado, enviado_em)
         values ($1::uuid, now(), 'reengajar', 'enviado', 'x', now())`,
        [await lead()],
      );
    }
    const comum = await followup(await lead(), admin, "reengajar");
    const outro = await followup(await lead(), admin, "reengajar");
    const lembrete = await followup(await lead(), admin, "lembrete_d1", true);

    // Relógio fixo no dia de hoje em São Paulo: dentro (12h) e depois (21h) da janela de envio.
    const hojeSp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    );
    const fila = await lerFilaEnvio(db(), { agora: new Date(`${hojeSp}T12:00:00-03:00`) });
    expect(fila.itens).toHaveLength(3);
    expect(fila.cotaDia).toBe(20);
    expect(fila.enviadosHoje).toBe(19);
    expect(fila.saemHoje).toBe(1);
    expect(fila.previsaoDias).toBe(2);
    expect(fila.itens[0]).toMatchObject({ followupId: lembrete, posicao: 1, lembrete: true });
    expect(fila.itens.map((i) => i.posicao)).toEqual([1, 2, 3]);

    const noite = await lerFilaEnvio(db(), { agora: new Date(`${hojeSp}T21:00:00-03:00`) });
    expect(noite.saemHoje).toBe(0);
    expect(noite.previsaoDias).toBe(2);

    await comTransacao((c) => removerDaFila(c, admin, comum));
    const { rows } = await db().query(
      `select f.status, f.motivo_cancelamento, e.agente, e.tipo_evento, e.origem_tipo
         from wakeclub.followups f
         join wakeclub.eventos_automacao e on e.entidade_id = f.id
        where f.id = $1::uuid`,
      [comum],
    );
    expect(rows).toEqual([
      {
        status: "abortado",
        motivo_cancelamento: "removido da fila pelo admin",
        agente: "humano",
        tipo_evento: "followup_aborted",
        origem_tipo: "painel",
      },
    ]);
    expect((await lerFilaEnvio(db())).itens.map((i) => i.followupId)).not.toContain(comum);

    // Já saiu (enviando): não remove e não muda nada.
    await db().query(`update wakeclub.followups set status = 'enviando' where id = $1::uuid`, [
      outro,
    ]);
    await expect(comTransacao((c) => removerDaFila(c, admin, outro))).rejects.toThrow(
      "Este follow-up já saiu da fila.",
    );
    const { rows: ainda } = await db().query(
      `select status from wakeclub.followups where id = $1::uuid`,
      [outro],
    );
    expect(ainda[0].status).toBe("enviando");
  });
});
