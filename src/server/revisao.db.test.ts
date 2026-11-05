import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { decidir } from "./aprovacao";
import type { Sessao } from "./auth";
import { comTransacao, getPoolMotor } from "./db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./motor/banco-teste";
import { registrarMensagem } from "./motor/ingestao";
import { listarParaRevisar, revisar } from "./revisao";

const db = () => getPoolMotor();

const sessao = (usuarioId: string, papel: Sessao["papel"] = "atendente"): Sessao => ({
  usuarioId,
  nome: "T",
  usuario: "t",
  papel,
  labelId: null,
});

/** Decisão de uma atendente sobre o próprio follow-up; devolve a avaliação criada. */
async function decisaoDaAtendente() {
  const dono = await criarVendedor("Atendente Revisada");
  const telefone = telefoneUnico();
  const { leadId } = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone,
      nome: "Lead Revisão",
      daEquipe: false,
      texto: "oi",
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  await db().query(
    `update wakeclub.leads set atendente_id = $2::uuid, etiqueta = 'Em atendimento'
      where id = $1::uuid`,
    [leadId, dono],
  );
  const { rows } = await db().query<{ id: string }>(
    `insert into wakeclub.followups
       (lead_id, agendado_para, tipo, status, texto_sugerido, sugerido_em)
     values ($1::uuid, now(), 'parado', 'aguardando_aprovacao', 'Texto da IA', now())
     returning id`,
    [leadId],
  );
  const followupId = rows[0].id;
  const { avaliacaoId } = await comTransacao((c) =>
    decidir(c, sessao(dono), {
      followupId,
      decisao: "enviar",
      texto: "Texto editado",
      motivos: ["Ajustei o texto"],
      textoLivre: "mais curto",
    }),
  );
  return { dono, telefone, followupId, avaliacaoId };
}

describe.skipIf(!bancoTesteAtivo)("revisão das decisões", () => {
  test("lista a decisão sem revisão com os dados da atendente", async () => {
    const { telefone, followupId, avaliacaoId } = await decisaoDaAtendente();
    const item = (await listarParaRevisar(db(), 7)).find((d) => d.avaliacaoId === avaliacaoId);
    expect(item).toMatchObject({
      avaliacaoId,
      followupId,
      leadNome: "Lead Revisão",
      telefone,
      vendedorNome: "Atendente Revisada",
      decisao: "enviar",
      motivos: ["Ajustei o texto"],
      textoLivre: "mais curto",
      textoOriginal: "Texto da IA",
      textoEnviado: "Texto editado",
      etiqueta: "Em atendimento",
    });
    expect(Number.isNaN(Date.parse(item?.decididoEm ?? ""))).toBe(false);
  });

  test("decisão antiga fora do período não aparece; ordem mais recente primeiro", async () => {
    const base = await decisaoDaAtendente();
    // A role do motor não tem UPDATE em avaliações: a antiga nasce com a data no passado.
    const { rows } = await db().query<{ id: string }>(
      `insert into wakeclub.followup_avaliacoes (followup_id, usuario_id, decisao, criado_em)
       select followup_id, usuario_id, 'recusar', now() - interval '10 days'
         from wakeclub.followup_avaliacoes where id = $1::uuid
       returning id`,
      [base.avaliacaoId],
    );
    const velha = { avaliacaoId: rows[0].id };
    const nova = await decisaoDaAtendente();
    const ids = (await listarParaRevisar(db(), 7)).map((d) => d.avaliacaoId);
    expect(ids).not.toContain(velha.avaliacaoId);
    expect(ids).toContain(nova.avaliacaoId);
    expect((await listarParaRevisar(db(), 30)).map((d) => d.avaliacaoId)).toContain(
      velha.avaliacaoId,
    );
    const lista = await listarParaRevisar(db(), 30);
    const datas = lista.map((d) => d.decididoEm);
    expect([...datas].sort().reverse()).toEqual(datas);
  });

  test("revisar grava a revisão, gera review_recorded e tira da lista", async () => {
    const { followupId, avaliacaoId } = await decisaoDaAtendente();
    const admin = await criarVendedor("Admin Revisor");
    await comTransacao((c) =>
      revisar(c, admin, { avaliacaoId, concorda: false, observacao: "cedo demais" }),
    );
    const { rows } = await db().query(
      `select admin_id, concorda, observacao from wakeclub.followup_revisoes
        where avaliacao_id = $1::uuid`,
      [avaliacaoId],
    );
    expect(rows).toEqual([{ admin_id: admin, concorda: false, observacao: "cedo demais" }]);
    const ev = await db().query(
      `select agente, entidade_tipo, metadados->>'concorda' as concorda,
              metadados->>'automatica' as automatica
         from wakeclub.eventos_automacao
        where entidade_id = $1::uuid and tipo_evento = 'review_recorded'`,
      [followupId],
    );
    expect(ev.rows).toEqual([
      { agente: "humano", entidade_tipo: "followup", concorda: "false", automatica: "false" },
    ]);
    const ids = (await listarParaRevisar(db(), 7)).map((d) => d.avaliacaoId);
    expect(ids).not.toContain(avaliacaoId);
  });

  test("segunda revisão da mesma avaliação lança", async () => {
    const { avaliacaoId } = await decisaoDaAtendente();
    const admin = await criarVendedor("Admin Duplo");
    await comTransacao((c) => revisar(c, admin, { avaliacaoId, concorda: true }));
    await expect(
      comTransacao((c) => revisar(c, admin, { avaliacaoId, concorda: false })),
    ).rejects.toThrow("Esta decisão já foi revisada.");
  });

  test("avaliação inexistente lança", async () => {
    const admin = await criarVendedor("Admin Perdido");
    await expect(
      comTransacao((c) => revisar(c, admin, { avaliacaoId: randomUUID(), concorda: true })),
    ).rejects.toThrow("Decisão não encontrada.");
  });
});
