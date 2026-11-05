import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import { getPool, getPoolMotor, getPoolRw } from "../db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";

const codigo = (e: unknown) => (e as { code?: string }).code;

const ETAPAS = [
  "Novo lead",
  "Em atendimento",
  "Link enviado",
  "Cadastrado",
  "Aguardando pagamento",
  "Aluno com horas",
  "Aluno sem horas",
  "Encerrado",
];

async function criarLead(etiqueta?: string): Promise<string> {
  const { rows } = await getPoolMotor().query<{ id: string }>(
    etiqueta
      ? "insert into wakeclub.leads (telefone, etiqueta) values ($1::text, $2::text) returning id"
      : "insert into wakeclub.leads (telefone) values ($1::text) returning id",
    etiqueta ? [telefoneUnico(), etiqueta] : [telefoneUnico()],
  );
  return rows[0].id;
}

async function criarFollowup(leadId: string, tipo: string, status = "pendente"): Promise<string> {
  const { rows } = await getPoolMotor().query<{ id: string }>(
    `insert into wakeclub.followups (lead_id, agendado_para, tipo, status)
     values ($1::uuid, now(), $2::text, $3::text) returning id`,
    [leadId, tipo, status],
  );
  return rows[0].id;
}

describe.skipIf(!bancoTesteAtivo)("migração 0008", () => {
  test("etiqueta antiga é rejeitada e as oito novas aceitas", async () => {
    expect(codigo(await criarLead("Atendimento").catch((e) => e))).toBe("23514");
    for (const etapa of ETAPAS) expect(await criarLead(etapa)).toBeString();
  });

  test("default de etiqueta é 'Novo lead'", async () => {
    const id = await criarLead();
    const { rows } = await getPoolMotor().query<{ etiqueta: string }>(
      "select etiqueta from wakeclub.leads where id = $1::uuid",
      [id],
    );
    expect(rows[0].etiqueta).toBe("Novo lead");
  });

  test("followups aceita tipo 'parado' e dois lembretes abertos de tipos diferentes no mesmo lead", async () => {
    const leadId = await criarLead();
    expect(await criarFollowup(leadId, "parado")).toBeString();
    expect(await criarFollowup(leadId, "lembrete_d1", "aprovado")).toBeString();
    expect(await criarFollowup(leadId, "lembrete_dia")).toBeString();
  });

  test("dois 'parado' abertos no mesmo lead violam 23505; dois lembrete_d1 abertos também", async () => {
    const a = await criarLead();
    await criarFollowup(a, "parado", "aguardando_aprovacao");
    expect(codigo(await criarFollowup(a, "parado").catch((e) => e))).toBe("23505");
    const b = await criarLead();
    await criarFollowup(b, "lembrete_d1");
    expect(codigo(await criarFollowup(b, "lembrete_d1", "aprovado").catch((e) => e))).toBe("23505");
    // Fechado não conta.
    const c = await criarLead();
    await criarFollowup(c, "lembrete_d1", "enviado");
    expect(await criarFollowup(c, "lembrete_d1")).toBeString();
  });

  test("app_eventos: unique (tipo, chave) → 23505; resultado inválido → 23514", async () => {
    const motor = getPoolMotor();
    const inserir = (chave: string, resultado: string) =>
      motor
        .query(
          `insert into wakeclub.app_eventos (tipo, chave, ocorrido_em, resultado)
           values ('aula', $1::text, now(), $2::text)`,
          [chave, resultado],
        )
        .catch((e) => e);
    const chave = `b-${crypto.randomUUID()}|2026-11-05|10:00`;
    expect(await inserir(chave, "aplicado")).toMatchObject({ rowCount: 1 });
    expect(codigo(await inserir(chave, "aplicado"))).toBe("23505");
    expect(codigo(await inserir(`b-${crypto.randomUUID()}`, "xyz"))).toBe("23514");
  });

  test("followup_revisoes: avaliacao_id único; painel_ro lê, painel_rw não (42501)", async () => {
    const motor = getPoolMotor();
    const usuario = await criarVendedor("Revisão");
    const followup = await criarFollowup(await criarLead(), "parado", "enviado");
    const av = await motor.query<{ id: string }>(
      `insert into wakeclub.followup_avaliacoes (followup_id, usuario_id, decisao)
       values ($1::uuid, $2::uuid, 'enviar') returning id`,
      [followup, usuario],
    );
    const revisar = () =>
      motor
        .query(
          `insert into wakeclub.followup_revisoes (avaliacao_id, admin_id, concorda)
           values ($1::uuid, $2::uuid, true)`,
          [av.rows[0].id, usuario],
        )
        .catch((e) => e);
    expect(await revisar()).toMatchObject({ rowCount: 1 });
    expect(codigo(await revisar())).toBe("23505");
    await getPool().query("select 1 from wakeclub.followup_revisoes limit 1");
    const erro = await getPoolRw()
      .query("select 1 from wakeclub.followup_revisoes limit 1")
      .catch((e) => e);
    expect(codigo(erro)).toBe("42501");
  });

  test("varreduras: segunda linha 'rodando' → 23505", async () => {
    const motor = getPoolMotor();
    await motor.query(
      "update wakeclub.varreduras set status = 'concluida' where status = 'rodando'",
    );
    await motor.query("insert into wakeclub.varreduras (status) values ('rodando')");
    const erro = await motor
      .query("insert into wakeclub.varreduras (status) values ('rodando')")
      .catch((e) => e);
    expect(codigo(erro)).toBe("23505");
    await motor.query(
      "update wakeclub.varreduras set status = 'concluida' where status = 'rodando'",
    );
  });

  test("prazos_parado existe em configuracoes com pagamento_pendente_h = 24", async () => {
    const { rows } = await getPoolMotor().query<{ valor: Record<string, number> }>(
      "select valor from wakeclub.configuracoes where chave = 'prazos_parado'",
    );
    expect(rows[0].valor).toEqual({
      em_atendimento_h: 24,
      link_enviado_h: 24,
      cadastrado_h: 24,
      aluno_com_horas_dias: 7,
      aluno_sem_horas_dias: 15,
      silencio_alunos_h: 48,
      pagamento_pendente_h: 24,
    });
  });

  test("migra etiquetas antigas, saldo e expira_em (transação revertida)", () => {
    // Recria o estado de antes da 0008 numa transação do dono do banco, reaplica o arquivo e
    // desfaz tudo no fim. A role do motor não alcança DDL, por isso o node à parte.
    const r = spawnSync(
      "node",
      [
        "--input-type=module",
        "-e",
        `import pg from "pg";
         import { readFileSync } from "node:fs";
         const c = new pg.Client(process.env.ADMIN_DATABASE_URL);
         await c.connect();
         const q = (s, p) => c.query(s, p).then((r) => r.rows);
         const tel = () => "+55638" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
         await q("begin");
         await q("set local search_path to wakeclub, public");
         await q("alter table leads drop constraint leads_etiqueta_valida");
         const lead = async (etiqueta) =>
           (await q("insert into leads (telefone, etiqueta) values ($1, $2) returning id", [tel(), etiqueta]))[0].id;
         const venda = (leadId, horas) =>
           q("insert into vendas (id_externo, comprada_em, valor, horas, lead_id) values (gen_random_uuid()::text, now(), 1, $1, $2)", [horas, leadId]);
         const ids = {
           novo: await lead("Novo Lead"),
           atend: await lead("Atendimento"),
           agendadoPago: await lead("Agendado"),
           aulaSemVenda: await lead("Aula realizada"),
           aulaHorasNulas: await lead("Aula realizada"),
           followLink: await lead("Follow-up"),
           followSemHist: await lead("Follow-up"),
           encerrada: await lead("Negociação encerrada"),
         };
         await venda(ids.agendadoPago, 2);
         await venda(ids.agendadoPago, 3);
         await venda(ids.aulaHorasNulas, 2);
         await venda(ids.aulaHorasNulas, null);
         await q(\`insert into eventos_automacao (agente, tipo_evento, entidade_tipo, entidade_id, lead_id,
                   origem_tipo, correlacao_id, estado_anterior, estado_novo, ocorrido_em)
                 values ('sistema', 'stage_changed', 'lead', $1, $1, 'motor', 't1', $2, $3, now() - interval '1 day'),
                        ('sistema', 'stage_changed', 'lead', $1, $1, 'motor', 't2', $4, $3, now())\`,
           [ids.followLink, { etiqueta: "Atendimento" }, { etiqueta: "Follow-up" }, { etiqueta: "Link enviado" }]);
         const f = (await q(\`insert into followups (lead_id, agendado_para, tipo, status, sugerido_em)
                   values ($1, now(), 'reengajar', 'aguardando_aprovacao', '2026-11-05T23:30:00-03:00') returning id\`,
           [ids.novo]))[0].id;
         await q("update followups set expira_em = null where id = $1", [f]);
         await q(readFileSync("db/migrations/0008_pipeline_etapas.sql", "utf8"));
         const out = {};
         for (const [k, id] of Object.entries(ids))
           out[k] = (await q("select etiqueta, saldo_horas from leads where id = $1", [id]))[0];
         out.expira = (await q("select to_char(expira_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') as e from followups where id = $1", [f]))[0].e;
         await q("rollback");
         await c.end();
         console.log(JSON.stringify(out));`,
      ],
      { encoding: "utf8" },
    );
    expect(r.stderr).toBe("");
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({
      novo: { etiqueta: "Novo lead", saldo_horas: null },
      atend: { etiqueta: "Em atendimento" },
      agendadoPago: { etiqueta: "Aluno com horas", saldo_horas: 5 },
      aulaSemVenda: { etiqueta: "Em atendimento", saldo_horas: null },
      aulaHorasNulas: { etiqueta: "Aluno com horas", saldo_horas: null },
      followLink: { etiqueta: "Link enviado" },
      followSemHist: { etiqueta: "Em atendimento" },
      encerrada: { etiqueta: "Encerrado" },
    });
    expect(out.expira).toBe("2026-11-05 19:59:59");
  });
});
