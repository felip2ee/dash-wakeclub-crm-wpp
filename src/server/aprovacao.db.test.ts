import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import type { Sessao } from "./auth";
import { decidir, listarFila, listarVendedores, schemaDecisao } from "./aprovacao";
import { comTransacao, getPoolMotor } from "./db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";

const db = () => getPoolMotor();

// Meio-dia de São Paulo do dia em que o texto do cenário ficou pronto (10h).
const SUGERIDO = new Date("2026-11-04T10:00:00-03:00");
const AGORA = new Date("2026-11-04T12:00:00-03:00");

const sessao = (usuarioId: string, papel: Sessao["papel"] = "atendente"): Sessao => ({
  usuarioId,
  nome: "T",
  usuario: "t",
  papel,
  labelId: null,
});

/** Lead com dono e um follow-up com texto pronto, aguardando a decisão do vendedor. */
async function cenario(texto = "Oi, ainda quer agendar a aula?") {
  const dono = await criarVendedor("Dona");
  const telefone = telefoneUnico();
  const { leadId } = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone,
      nome: "Lead Aprovar",
      daEquipe: false,
      texto: "quanto custa?",
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  await db().query(
    `update wakeclub.leads
        set atendente_id = $2::uuid, n_toques = 2, temperatura = 'quente',
            etiqueta = 'Atendimento', horas_estimadas = 4
      where id = $1::uuid`,
    [leadId, dono],
  );
  const { rows } = await db().query<{ id: string }>(
    `insert into wakeclub.followups
       (lead_id, agendado_para, tipo, status, texto_sugerido, sugerido_em)
     values ($1::uuid, now(), 'reengajar', 'aguardando_aprovacao', $2::text, $3::timestamptz)
     returning id`,
    [leadId, texto, SUGERIDO],
  );
  return { dono, leadId, telefone, followupId: rows[0].id };
}

async function followup(id: string) {
  const { rows } = await db().query(
    `select status, texto_enviado, aprovado_por, aprovado_em, motivo_cancelamento
       from wakeclub.followups where id = $1::uuid`,
    [id],
  );
  return rows[0];
}

async function avaliacoes(followupId: string) {
  const { rows } = await db().query(
    `select usuario_id, decisao, motivos, texto_livre, texto_original, texto_enviado
       from wakeclub.followup_avaliacoes where followup_id = $1::uuid`,
    [followupId],
  );
  return rows;
}

async function eventos(followupId: string) {
  const { rows } = await db().query<{ tipo_evento: string }>(
    `select tipo_evento from wakeclub.eventos_automacao
      where entidade_tipo = 'followup' and entidade_id = $1::uuid`,
    [followupId],
  );
  return rows.map((r) => r.tipo_evento);
}

describe("schemaDecisao", () => {
  const id = randomUUID();
  test("aceita motivos da lista da decisao", () => {
    expect(
      schemaDecisao.safeParse({ followupId: id, decisao: "recusar", motivos: ["Tom errado"] })
        .success,
    ).toBe(true);
    expect(
      schemaDecisao.safeParse({ followupId: id, decisao: "enviar", motivos: [] }).success,
    ).toBe(true);
  });

  test("recusa motivo da outra lista ou inventado", () => {
    expect(
      schemaDecisao.safeParse({ followupId: id, decisao: "enviar", motivos: ["Tom errado"] })
        .success,
    ).toBe(false);
    expect(
      schemaDecisao.safeParse({ followupId: id, decisao: "recusar", motivos: ["qualquer"] })
        .success,
    ).toBe(false);
  });
});

describe.skipIf(!bancoTesteAtivo)("fila de aprovação", () => {
  test("lista o card do vendedor com as ultimas 6 mensagens", async () => {
    const { dono, leadId, telefone, followupId } = await cenario();
    for (let i = 0; i < 7; i++) {
      await comTransacao((c) =>
        registrarMensagem(
          c,
          {
            tipo: "mensagem",
            telefone,
            nome: null,
            daEquipe: true,
            texto: `msg ${i}`,
            tipoMidia: "texto",
            enviadaEm: new Date(Date.now() + i * 1000).toISOString(),
            evolutionMsgId: randomUUID(),
          },
          { usuarioId: dono },
        ),
      );
    }
    // A conversa viva cancelou o follow-up; volta a aguardar para o teste da fila.
    await db().query(
      "update wakeclub.followups set status = 'aguardando_aprovacao' where id = $1::uuid",
      [followupId],
    );
    const fila = await listarFila(db(), dono);
    expect(fila).toHaveLength(1);
    const card = fila[0];
    expect(card).toMatchObject({
      followupId,
      leadId,
      nome: "Lead Aprovar",
      telefone,
      temperatura: "quente",
      etiqueta: "Atendimento",
      horasEstimadas: 4,
      numeroToque: 3,
      textoSugerido: "Oi, ainda quer agendar a aula?",
    });
    // 4 h × 360 × 25% (Atendimento quente).
    expect(card.valorEsperado).toBe(360);
    expect(card.mensagens.map((m) => m.texto)).toEqual([
      "msg 1",
      "msg 2",
      "msg 3",
      "msg 4",
      "msg 5",
      "msg 6",
    ]);
    expect(card.mensagens[0]).toMatchObject({
      direcao: "equipe",
      autoria: { tipo: "app", nome: "Dona" },
    });
    expect(await listarFila(db(), await criarVendedor("Outra"))).toHaveLength(0);
  });

  test("listarVendedores traz o vendedor ativo", async () => {
    const id = await criarVendedor("Seletor");
    expect(await listarVendedores(db())).toContainEqual({ id, nome: "Seletor" });
  });

  test("posse: atendente de outro lead nao decide; admin decide", async () => {
    const { followupId } = await cenario();
    const outra = await criarVendedor("Intrusa");
    await expect(
      comTransacao((c) =>
        decidir(c, sessao(outra), { followupId, decisao: "recusar", motivos: [] }),
      ),
    ).rejects.toThrow("Follow-up indisponível");
    expect((await followup(followupId)).status).toBe("aguardando_aprovacao");
    const admin = await criarVendedor("Admin");
    await comTransacao((c) =>
      decidir(c, sessao(admin, "admin"), { followupId, decisao: "recusar", motivos: [] }),
    );
    expect((await followup(followupId)).status).toBe("abortado");
  });

  test("enviar grava aprovado, texto_enviado, aprovado_por, avaliacao e evento", async () => {
    const { dono, followupId } = await cenario();
    await comTransacao((c) =>
      decidir(
        c,
        sessao(dono),
        {
          followupId,
          decisao: "enviar",
          texto: "Oi! Ainda quer agendar?",
          motivos: ["Ajustei o texto"],
          textoLivre: "mais curto",
        },
        AGORA,
      ),
    );
    const f = await followup(followupId);
    expect(f).toMatchObject({
      status: "aprovado",
      texto_enviado: "Oi! Ainda quer agendar?",
      aprovado_por: dono,
    });
    expect(f.aprovado_em).not.toBeNull();
    expect(await avaliacoes(followupId)).toEqual([
      {
        usuario_id: dono,
        decisao: "enviar",
        motivos: ["Ajustei o texto"],
        texto_livre: "mais curto",
        texto_original: "Oi, ainda quer agendar a aula?",
        texto_enviado: "Oi! Ainda quer agendar?",
      },
    ]);
    expect(await eventos(followupId)).toEqual(["followup_human_approved"]);
    expect(await listarFila(db(), dono)).toHaveLength(0);
  });

  test("enviar sem texto usa o sugerido", async () => {
    const { dono, followupId } = await cenario();
    await comTransacao((c) =>
      decidir(c, sessao(dono), { followupId, decisao: "enviar", motivos: ["Texto certo"] }, AGORA),
    );
    expect((await followup(followupId)).texto_enviado).toBe("Oi, ainda quer agendar a aula?");
  });

  test("enviar sem texto e sem sugerido falha", async () => {
    const { dono, followupId } = await cenario();
    await db().query("update wakeclub.followups set texto_sugerido = null where id = $1::uuid", [
      followupId,
    ]);
    await expect(
      comTransacao((c) =>
        decidir(c, sessao(dono), { followupId, decisao: "enviar", motivos: [] }, AGORA),
      ),
    ).rejects.toThrow("sem texto");
    expect((await followup(followupId)).status).toBe("aguardando_aprovacao");
  });

  test("recusar grava abortado e followup_human_rejected", async () => {
    const { dono, followupId } = await cenario();
    await comTransacao((c) =>
      decidir(c, sessao(dono), { followupId, decisao: "recusar", motivos: ["Cedo demais"] }),
    );
    expect(await followup(followupId)).toMatchObject({
      status: "abortado",
      motivo_cancelamento: "recusado pelo vendedor",
      texto_enviado: null,
      aprovado_por: null,
    });
    expect(await avaliacoes(followupId)).toMatchObject([
      { decisao: "recusar", motivos: ["Cedo demais"], texto_enviado: null },
    ]);
    expect(await eventos(followupId)).toEqual(["followup_human_rejected"]);
  });

  test("pular grava avaliacao com motivos vazios", async () => {
    const { dono, followupId } = await cenario();
    await comTransacao((c) =>
      decidir(c, sessao(dono), { followupId, decisao: "enviar", motivos: [] }, AGORA),
    );
    expect(await avaliacoes(followupId)).toMatchObject([
      { decisao: "enviar", motivos: [], texto_livre: null },
    ]);
  });

  test("so decide follow-up aguardando aprovacao", async () => {
    const { dono, followupId } = await cenario();
    const decidirUma = () =>
      comTransacao((c) =>
        decidir(c, sessao(dono), { followupId, decisao: "enviar", motivos: [] }, AGORA),
      );
    await decidirUma();
    await expect(decidirUma()).rejects.toThrow("não está mais aguardando");
    expect(await avaliacoes(followupId)).toHaveLength(1);
  });

  test("enviar depois das 19h59 de SP é recusado; recusar ainda vale", async () => {
    const { dono, followupId } = await cenario();
    const noite = new Date("2026-11-04T20:00:00-03:00");
    await expect(
      comTransacao((c) =>
        decidir(c, sessao(dono), { followupId, decisao: "enviar", motivos: [] }, noite),
      ),
    ).rejects.toThrow("Follow-up expirou: a IA prepara um novo amanhã");
    const amanha = new Date("2026-11-05T09:00:00-03:00");
    await expect(
      comTransacao((c) =>
        decidir(c, sessao(dono), { followupId, decisao: "enviar", motivos: [] }, amanha),
      ),
    ).rejects.toThrow("Follow-up expirou");
    expect((await followup(followupId)).status).toBe("aguardando_aprovacao");
    expect(await avaliacoes(followupId)).toHaveLength(0);
    await comTransacao((c) =>
      decidir(c, sessao(dono), { followupId, decisao: "recusar", motivos: [] }, noite),
    );
    expect((await followup(followupId)).status).toBe("abortado");
  });
});
