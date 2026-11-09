import { describe, expect, test } from "bun:test";

import { getPoolMotor } from "../db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import {
  OBJETIVOS,
  PRAZOS_PADRAO,
  SQL_PARADOS,
  contarParados,
  gravarPrazos,
  lerPrazos,
  tarefaPagamentoPendente,
  tarefaParados,
} from "./parado";

const db = () => getPoolMotor();

type Campos = {
  etiqueta: string;
  equipe?: string | null; // intervalo atrás de now(), ex.: '25 hours'
  lead?: string | null;
  app?: string | null;
  ultimaAula?: string | null;
  proximaAula?: string | null; // intervalo à frente de now()
  saldo?: number | null;
  pendente?: string | null;
};

let atendente: string | undefined;

async function criarLead(c: Campos): Promise<string> {
  atendente ??= await criarVendedor("Atendente Parado");
  const atras = (i: string | null | undefined) => i ?? null;
  const { rows } = await db().query<{ id: string }>(
    `insert into wakeclub.leads
       (telefone, atendente_id, etiqueta, ultima_msg_equipe_em, ultima_msg_lead_em,
        ultimo_evento_app_em, ultima_aula_em, proxima_aula_em, saldo_horas,
        pagamento_pendente_desde)
     values ($1::text, $2::uuid, $3::text,
             now() - $4::interval, now() - $5::interval, now() - $6::interval,
             now() - $7::interval, now() + $8::interval, $9::integer, now() - $10::interval)
     returning id`,
    [
      telefoneUnico(),
      atendente,
      c.etiqueta,
      atras(c.equipe),
      atras(c.lead),
      atras(c.app),
      atras(c.ultimaAula),
      atras(c.proximaAula),
      c.saldo ?? null,
      atras(c.pendente),
    ],
  );
  return rows[0].id;
}

async function followups(leadId: string) {
  const { rows } = await db().query<{ tipo: string; motivo: string; status: string }>(
    "select tipo, motivo, status from wakeclub.followups where lead_id = $1::uuid order by criado_em",
    [leadId],
  );
  return rows;
}

async function eventos(leadId: string) {
  const { rows } = await db().query<{ tipo_evento: string; decisao: string; motivo: string }>(
    `select tipo_evento, decisao, motivo from wakeclub.eventos_automacao
      where lead_id = $1::uuid order by id`,
    [leadId],
  );
  return rows;
}

async function parado(
  c: Campos,
): Promise<{ id: string; f: Awaited<ReturnType<typeof followups>> }> {
  const id = await criarLead(c);
  await tarefaParados(db());
  return { id, f: await followups(id) };
}

describe.skipIf(!bancoTesteAtivo)("sinal parado", () => {
  test("Em atendimento com equipe há 25 h e lead calado vira follow-up parado", async () => {
    const { id, f } = await parado({
      etiqueta: "Em atendimento",
      equipe: "25 hours",
      lead: "26 hours",
    });
    expect(f).toEqual([{ tipo: "parado", motivo: "retomar o interesse", status: "pendente" }]);
    expect(await eventos(id)).toEqual([
      {
        tipo_evento: "followup_created",
        decisao: "parado em Em atendimento",
        motivo: "retomar o interesse",
      },
    ]);
  });

  test("evento do app depois da equipe tira do parado", async () => {
    const { f } = await parado({ etiqueta: "Em atendimento", equipe: "25 hours", app: "24 hours" });
    expect(f).toEqual([]);
  });

  test("lead que mandou a última mensagem não está parado", async () => {
    const { f } = await parado({
      etiqueta: "Em atendimento",
      equipe: "26 hours",
      lead: "25 hours",
    });
    expect(f).toEqual([]);
  });

  test("Link enviado há 23 h ainda não está parado", async () => {
    const { f } = await parado({ etiqueta: "Link enviado", equipe: "23 hours" });
    expect(f).toEqual([]);
  });

  test("Cadastrado há 25 h recebe o objetivo de pagar", async () => {
    const { f } = await parado({ etiqueta: "Cadastrado", equipe: "25 hours" });
    expect(f.map((x) => x.motivo)).toEqual(["escolher pacote e pagar"]);
  });

  test("Aluno com horas sem aula futura, 8 dias sem aula e 72 h calado está parado", async () => {
    const base = { etiqueta: "Aluno com horas", saldo: 2, ultimaAula: "8 days" };
    const { f } = await parado({ ...base, equipe: "72 hours", lead: "72 hours" });
    expect(f.map((x) => x.motivo)).toEqual(["agendar a próxima aula"]);
  });

  test("Aluno com horas com aula futura, saldo nulo ou conversa recente não", async () => {
    const base = { etiqueta: "Aluno com horas", ultimaAula: "8 days", equipe: "72 hours" };
    expect((await parado({ ...base, saldo: 2, proximaAula: "2 days" })).f).toEqual([]);
    expect((await parado({ ...base, saldo: null })).f).toEqual([]);
    expect((await parado({ ...base, saldo: 2, lead: "47 hours" })).f).toEqual([]);
    expect((await parado({ ...base, saldo: 2, app: "6 days" })).f).toEqual([]);
  });

  test("Aluno sem horas 16 dias após a última aula pede recompra", async () => {
    const { f } = await parado({ etiqueta: "Aluno sem horas", ultimaAula: "16 days" });
    expect(f.map((x) => x.motivo)).toEqual(["recompra de horas"]);
    expect((await parado({ etiqueta: "Aluno sem horas", ultimaAula: "14 days" })).f).toEqual([]);
  });

  test("Novo lead e Encerrado nunca ficam parados", async () => {
    expect((await parado({ etiqueta: "Novo lead", equipe: "3 days" })).f).toEqual([]);
    expect((await parado({ etiqueta: "Encerrado", equipe: "3 days" })).f).toEqual([]);
  });

  test("opt-out, não atender e sem dono ficam fora", async () => {
    for (const set of ["opt_out = true", "sem_atendimento = true", "atendente_id = null"]) {
      const id = await criarLead({ etiqueta: "Em atendimento", equipe: "25 hours" });
      await db().query(`update wakeclub.leads set ${set} where id = $1::uuid`, [id]);
      await tarefaParados(db());
      expect(await followups(id)).toEqual([]);
    }
  });

  test("rodar duas vezes não duplica e follow-up aberto de outro tipo bloqueia", async () => {
    const id = await criarLead({ etiqueta: "Em atendimento", equipe: "25 hours" });
    expect(await contarParados(db())).toBeGreaterThan(0);
    await tarefaParados(db());
    await tarefaParados(db());
    expect(await followups(id)).toHaveLength(1);

    const outro = await criarLead({ etiqueta: "Em atendimento", equipe: "25 hours" });
    await db().query(
      `insert into wakeclub.followups (lead_id, agendado_para, tipo) values ($1::uuid, now(), 'reengajar')`,
      [outro],
    );
    await tarefaParados(db());
    expect((await followups(outro)).map((x) => x.tipo)).toEqual(["reengajar"]);
  });

  test("parado expirado (legado) volta a ser sugerido sem atividade nova", async () => {
    const id = await criarLead({ etiqueta: "Em atendimento", equipe: "25 hours" });
    await tarefaParados(db());
    await db().query("update wakeclub.followups set status = 'expirado' where lead_id = $1::uuid", [
      id,
    ]);
    await tarefaParados(db());
    expect(await followups(id)).toHaveLength(2);
  });

  test("um parado por episódio: encerrado não renasce até haver atividade nova", async () => {
    const id = await criarLead({ etiqueta: "Em atendimento", equipe: "25 hours" });
    const p = PRAZOS_PADRAO;
    const estaParado = async () =>
      (
        await db().query(`select 1 from (${SQL_PARADOS}) p where p.id = $7::uuid`, [
          p.emAtendimentoH,
          p.linkEnviadoH,
          p.cadastradoH,
          p.alunoComHorasDias,
          p.alunoSemHorasDias,
          p.silencioAlunosH,
          id,
        ])
      ).rowCount === 1;

    await tarefaParados(db());
    expect(await followups(id)).toHaveLength(1);

    await db().query("update wakeclub.followups set status = 'abortado' where lead_id = $1::uuid", [
      id,
    ]);
    await tarefaParados(db());
    expect(await followups(id)).toHaveLength(1);
    expect(await estaParado()).toBe(false);

    // Episódio novo: a equipe voltou a falar depois do follow-up e o lead calou de novo.
    await db().query(
      "update wakeclub.followups set criado_em = now() - interval '3 days' where lead_id = $1::uuid",
      [id],
    );
    await db().query(
      "update wakeclub.leads set ultima_msg_equipe_em = now() - interval '25 hours' where id = $1::uuid",
      [id],
    );
    await tarefaParados(db());
    expect(await followups(id)).toHaveLength(2);
  });

  test("pagamento pendente há 25 h volta para Cadastrado com follow-up de compra", async () => {
    const id = await criarLead({ etiqueta: "Aguardando pagamento", pendente: "25 hours" });
    expect(await tarefaPagamentoPendente(db())).toBeGreaterThan(0);
    const { rows } = await db().query(
      "select etiqueta, pagamento_pendente_desde from wakeclub.leads where id = $1::uuid",
      [id],
    );
    expect(rows[0]).toEqual({ etiqueta: "Cadastrado", pagamento_pendente_desde: null });
    expect(await followups(id)).toEqual([
      { tipo: "parado", motivo: OBJETIVOS.pagamento_cancelado, status: "pendente" },
    ]);
    const ev = await eventos(id);
    expect(ev.filter((e) => e.tipo_evento === "stage_changed")).toEqual([
      {
        tipo_evento: "stage_changed",
        decisao: "Aguardando pagamento -> Cadastrado",
        motivo: "pagamento pendente há mais de 24 h tratado como cancelado",
      },
    ]);
    await tarefaPagamentoPendente(db());
    expect((await eventos(id)).filter((e) => e.tipo_evento === "stage_changed")).toHaveLength(1);
  });

  test("pagamento pendente há 23 h fica como está", async () => {
    const id = await criarLead({ etiqueta: "Aguardando pagamento", pendente: "23 hours" });
    await tarefaPagamentoPendente(db());
    const { rows } = await db().query("select etiqueta from wakeclub.leads where id = $1::uuid", [
      id,
    ]);
    expect(rows[0].etiqueta).toBe("Aguardando pagamento");
    expect(await followups(id)).toEqual([]);
    expect(await eventos(id)).toEqual([]);
  });

  test("prazos gravados voltam na leitura", async () => {
    const antes = await lerPrazos(db());
    try {
      await gravarPrazos(db(), { ...PRAZOS_PADRAO, emAtendimentoH: 48 });
      expect(await lerPrazos(db())).toEqual({ ...PRAZOS_PADRAO, emAtendimentoH: 48 });
    } finally {
      await gravarPrazos(db(), antes);
    }
  });
});
