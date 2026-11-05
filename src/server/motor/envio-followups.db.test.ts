import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { getPoolMotor } from "../db";
import { type AdaptadorEvolution, type Envio, ErroEnvio } from "../evolution/tipos";
import type { ClienteIa } from "../ia/tipos";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import { type Candidato, ordenarFila, tarefaEnvioFollowups } from "./envio-followups";

const db = () => getPoolMotor();

// 12h e 20h30 de São Paulo (UTC-3).
const MEIO_DIA = () => new Date("2026-11-04T15:00:00Z");
const NOITE = () => new Date("2026-11-04T23:30:00Z");

/** Adaptador falso: registra cada envio e lança `falhar` quando houver. */
function adaptadorFalso(falhar?: Error) {
  const chamadas: Envio[] = [];
  const adaptador: AdaptadorEvolution = {
    chaveDeOrdem: () => null,
    normalizar: () => [],
    baixarMidia: async () => null,
    estadoConexao: async () => "open",
    enviar: async (envio) => {
      chamadas.push(envio);
      if (falhar) throw falhar;
      return { evolutionMsgId: randomUUID() };
    },
  };
  return { chamadas, adaptador };
}

/** Porteiro falso: sempre a mesma resposta; conta as chamadas. */
function porteiroFalso(resposta: { enviar: boolean; motivo: string }) {
  const chamadas: string[] = [];
  const ia: ClienteIa = {
    async chatJson<T>(p: { usuario: string }) {
      chamadas.push(p.usuario);
      return resposta as T;
    },
    async transcrever() {
      throw new Error("não usado");
    },
  };
  return { ia, chamadas };
}

type Cenario = {
  tipo?: string;
  status?: string;
  texto?: string | null;
  aprovadoHa?: string;
  atualizadoHa?: string;
  semAprovador?: boolean;
  optOut?: boolean;
};

/** Lead com dono e um follow-up já decidido pelo humano. */
async function cenario({
  tipo = "reengajar",
  status = "aprovado",
  texto = "Oi! Ainda quer agendar a aula?",
  aprovadoHa = "1 minute",
  atualizadoHa = "0 minutes",
  semAprovador = false,
  optOut = false,
}: Cenario = {}) {
  const dono = await criarVendedor("Vendedora Envio");
  const telefone = telefoneUnico();
  const { rows } = await db().query<{ id: string; lead_id: string }>(
    `with l as (
       insert into wakeclub.leads (telefone, nome, atendente_id, n_toques, opt_out)
       values ($1::text, 'Lead Envio', $2::uuid, 2, $8::boolean) returning id
     )
     insert into wakeclub.followups
       (lead_id, agendado_para, tipo, status, texto_sugerido, sugerido_em, texto_enviado,
        aprovado_em, aprovado_por, atualizado_em)
     select l.id, now(), $9::text, $3::text, 'Oi, tudo certo?', now(), $4::text,
            now() - $5::interval, case when $7::boolean then null else $2::uuid end,
            now() - $6::interval
       from l
     returning id, lead_id`,
    [telefone, dono, status, texto, aprovadoHa, atualizadoHa, semAprovador, optOut, tipo],
  );
  return { dono, telefone, followupId: rows[0].id, leadId: rows[0].lead_id };
}

async function followup(id: string) {
  const { rows } = await db().query(
    `select f.status, f.enviado_em, f.reconferido_em, f.erro_envio, f.tentativas_envio, f.motivo_cancelamento,
            l.n_toques
       from wakeclub.followups f join wakeclub.leads l on l.id = f.lead_id
      where f.id = $1::uuid`,
    [id],
  );
  return rows[0];
}

async function eventos(followupId: string) {
  const { rows } = await db().query<{ tipo_evento: string }>(
    `select tipo_evento from wakeclub.eventos_automacao
      where entidade_tipo = 'followup' and entidade_id = $1::uuid order by id`,
    [followupId],
  );
  return rows.map((r) => r.tipo_evento);
}

async function avisos(usuarioId: string) {
  const { rows } = await db().query(
    `select tipo, titulo, corpo, url, status from wakeclub.notificacoes
      where usuario_id = $1::uuid`,
    [usuarioId],
  );
  return rows;
}

describe("ordenarFila", () => {
  const c = (id: string, tipo: string, valorEsperado: number, dia: number): Candidato => ({
    id,
    tipo,
    valorEsperado,
    aprovadoEm: new Date(Date.UTC(2026, 10, dia)),
  });

  test("lembretes primeiro, depois maior valor esperado, depois o aprovado mais antigo", () => {
    const fila = ordenarFila([
      c("parado-caro", "parado", 1000, 1),
      c("parado-novo", "parado", 50, 4),
      c("lembrete", "lembrete_dia", 0, 5),
      c("parado-antigo", "parado", 50, 2),
      c("d1", "lembrete_d1", 0, 3),
    ]);
    expect(fila.map((x) => x.id)).toEqual([
      "d1",
      "lembrete",
      "parado-caro",
      "parado-antigo",
      "parado-novo",
    ]);
  });
});

describe.skipIf(!bancoTesteAtivo)("envio dos aprovados", () => {
  // Premissa: os testes rodam em série (padrão do bun test) e nenhum outro processo usa
  // este banco ao mesmo tempo. O banco é compartilhado entre testes: tira da frente os aprovados/enviando que
  // sobraram e afasta o último envio para o intervalo não segurar o próximo teste.
  beforeEach(async () => {
    // Eventos da Evolution que outros testes deixaram abertos ou falhos travariam o envio.
    await db().query(
      `update wakeclub.webhook_eventos set status = 'processado'
        where origem = 'evolution' and status in ('pendente', 'processando', 'falhou')`,
    );
    await db().query(
      `update wakeclub.followups
          set status = 'cancelado', motivo_cancelamento = 'limpeza do teste'
        where status in ('aprovado', 'enviando')`,
    );
    await db().query(
      `update wakeclub.followups set enviado_em = enviado_em - interval '1 day'
        where status = 'enviado' and enviado_em > now() - interval '1 day'`,
    );
  });

  test("envia o aprovado mais antigo", async () => {
    const antigo = await cenario({ aprovadoHa: "10 minutes" });
    const novo = await cenario({ aprovadoHa: "5 minutes" });
    const { chamadas, adaptador } = adaptadorFalso();

    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(1);

    expect(chamadas).toEqual([
      { telefone: antigo.telefone, tipo: "texto", texto: "Oi! Ainda quer agendar a aula?" },
    ]);
    const f = await followup(antigo.followupId);
    expect(f).toMatchObject({ status: "enviado", n_toques: 3 });
    expect(f.enviado_em).not.toBeNull();
    expect((await followup(novo.followupId)).status).toBe("aprovado");

    const { rows } = await db().query(
      `select direcao, texto, usuario_id, enviada_por, followup_id
         from wakeclub.mensagens where lead_id = $1::uuid`,
      [antigo.leadId],
    );
    expect(rows).toEqual([
      {
        direcao: "equipe",
        texto: "Oi! Ainda quer agendar a aula?",
        usuario_id: antigo.dono,
        enviada_por: "app",
        followup_id: antigo.followupId,
      },
    ]);
    expect(await eventos(antigo.followupId)).toEqual(["followup_sent"]);
  });

  test("respeita intervalo", async () => {
    const a = await cenario({ aprovadoHa: "10 minutes" });
    const b = await cenario({ aprovadoHa: "5 minutes" });
    const { chamadas, adaptador } = adaptadorFalso();

    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(1);
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect(chamadas).toHaveLength(1);
    expect((await followup(b.followupId)).status).toBe("aprovado");

    // Passados os 120 s do conservador (ou 45 s do aquecido), o próximo sai.
    await db().query(
      `update wakeclub.followups set enviado_em = now() - interval '121 seconds'
        where id = $1::uuid`,
      [a.followupId],
    );
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(1);
    expect((await followup(b.followupId)).status).toBe("enviado");
  });

  test("fora da janela nao envia", async () => {
    const { followupId } = await cenario();
    const { chamadas, adaptador } = adaptadorFalso();
    expect(await tarefaEnvioFollowups({ adaptador, agora: NOITE })).toBe(0);
    expect(chamadas).toHaveLength(0);
    expect((await followup(followupId)).status).toBe("aprovado");
  });

  test("nao_saiu volta a aprovado com erro e na terceira aborta", async () => {
    const { dono, followupId } = await cenario();
    const { chamadas, adaptador } = adaptadorFalso(
      new ErroEnvio("evolution fora do ar", "nao_saiu"),
    );

    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect(await followup(followupId)).toMatchObject({
      status: "aprovado",
      erro_envio: "evolution fora do ar",
      tentativas_envio: 1,
      n_toques: 2,
    });
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect((await followup(followupId)).tentativas_envio).toBe(2);
    expect(await avisos(dono)).toHaveLength(0);

    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect(await followup(followupId)).toMatchObject({
      status: "abortado",
      motivo_cancelamento: "falha no envio",
      tentativas_envio: 3,
    });
    expect(chamadas).toHaveLength(3);
    expect(await eventos(followupId)).toEqual(["followup_aborted"]);
    expect(await avisos(dono)).toEqual([
      {
        tipo: "aviso",
        titulo: "Follow-up não saiu: Lead Envio",
        corpo: "falha no envio",
        url: "/meus-leads",
        status: "pendente",
      },
    ]);

    // Abortado não volta a ser tentado.
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect(chamadas).toHaveLength(3);
  });

  for (const [nome, erro] of [
    ["incerto", new ErroEnvio("timeout depois de mandar", "incerto")],
    ["erro genérico", new Error("x".repeat(1000))],
  ] as const) {
    test(`${nome} aborta sem retentar e avisa`, async () => {
      const { dono, followupId } = await cenario();
      const { chamadas, adaptador } = adaptadorFalso(erro);

      expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
      const f = await followup(followupId);
      expect(f).toMatchObject({
        status: "abortado",
        motivo_cancelamento: "envio sem confirmação",
        tentativas_envio: 1,
        n_toques: 2,
      });
      expect(f.erro_envio.length).toBeLessThanOrEqual(200);
      expect(await eventos(followupId)).toEqual(["followup_aborted"]);
      expect(await avisos(dono)).toMatchObject([
        { titulo: "Follow-up sem confirmação: Lead Envio" },
      ]);
      expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
      expect(chamadas).toHaveLength(1);
    });
  }

  test("fila da Evolution atrasada ou com falha recente segura o envio", async () => {
    const { followupId } = await cenario();
    const { chamadas, adaptador } = adaptadorFalso();
    const evento = async (status: string, ha: string) => {
      const { rows } = await db().query<{ id: string }>(
        `insert into wakeclub.webhook_eventos (origem, corpo, status, recebido_em)
         values ('evolution', '{}'::jsonb, $1::text, now() - $2::interval) returning id`,
        [status, ha],
      );
      return rows[0].id;
    };
    const resolver = (id: string) =>
      db().query("update wakeclub.webhook_eventos set status = 'processado' where id = $1", [id]);

    // Pendente recente (menos de 2 min) e falha antiga (mais de 30 min) não seguram.
    const recente = await evento("pendente", "30 seconds");
    const falhaAntiga = await evento("falhou", "31 minutes");
    const atrasado = await evento("processando", "3 minutes");
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    await resolver(atrasado);
    const falhou = await evento("falhou", "5 minutes");
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect(chamadas).toHaveLength(0);
    expect((await followup(followupId)).status).toBe("aprovado");

    await resolver(falhou);
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(1);
    await resolver(recente);
    await resolver(falhaAntiga);
  });

  test("envio ignora cancelado", async () => {
    const { followupId } = await cenario({ status: "cancelado" });
    const { chamadas, adaptador } = adaptadorFalso();
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect(chamadas).toHaveLength(0);
    expect((await followup(followupId)).status).toBe("cancelado");
  });

  test("enviando órfão vira abortado com aviso", async () => {
    const orfao = await cenario({ status: "enviando", atualizadoHa: "16 minutes" });
    const recente = await cenario({ status: "enviando", atualizadoHa: "1 minute" });
    const { chamadas, adaptador } = adaptadorFalso();

    // Órfão é tratado mesmo fora da janela, e nunca é reenviado.
    expect(await tarefaEnvioFollowups({ adaptador, agora: NOITE })).toBe(0);
    expect(chamadas).toHaveLength(0);
    expect(await followup(orfao.followupId)).toMatchObject({
      status: "abortado",
      motivo_cancelamento: "envio sem confirmação",
    });
    expect(await eventos(orfao.followupId)).toEqual(["followup_aborted"]);
    expect(await avisos(orfao.dono)).toMatchObject([
      {
        tipo: "aviso",
        titulo: "Follow-up sem confirmação: Lead Envio",
        corpo: "Envio sem confirmação: confira a conversa antes de reenviar.",
        status: "pendente",
      },
    ]);
    expect((await followup(recente.followupId)).status).toBe("enviando");
  });

  test("ignora aprovado sem aprovador ou de lead em opt-out", async () => {
    const semAprovador = await cenario({ semAprovador: true });
    const optOut = await cenario({ optOut: true });
    const { chamadas, adaptador } = adaptadorFalso();
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect(chamadas).toHaveLength(0);
    expect((await followup(semAprovador.followupId)).status).toBe("aprovado");
    expect((await followup(optOut.followupId)).status).toBe("aprovado");
  });

  test("aprovado sem texto aborta sem chamar o adaptador", async () => {
    const { dono, followupId } = await cenario({ texto: "  " });
    const { chamadas, adaptador } = adaptadorFalso();
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect(chamadas).toHaveLength(0);
    expect(await followup(followupId)).toMatchObject({
      status: "abortado",
      motivo_cancelamento: "sem texto",
    });
    expect(await avisos(dono)).toMatchObject([
      { titulo: "Follow-up sem texto: Lead Envio", corpo: "sem texto" },
    ]);
  });

  test("lembrete aprovado sai antes do follow-up comum mais antigo", async () => {
    const comum = await cenario({ aprovadoHa: "10 minutes" });
    const lembrete = await cenario({ tipo: "lembrete_d1", aprovadoHa: "1 minute" });
    const { adaptador } = adaptadorFalso();
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(1);
    expect((await followup(lembrete.followupId)).status).toBe("enviado");
    expect((await followup(comum.followupId)).status).toBe("aprovado");
  });

  test("cota do dia cheia: nada sai, mesmo com aprovado na fila", async () => {
    const enviados = await Promise.all(
      Array.from({ length: 20 }, () => cenario({ status: "enviado" })),
    );
    // Hoje (SP), mas fora do intervalo do modo: quem segura é a cota.
    await db().query(
      `update wakeclub.followups set enviado_em = now() - interval '130 seconds'
        where id = any($1::uuid[])`,
      [enviados.map((e) => e.followupId)],
    );
    const { followupId } = await cenario();
    const { chamadas, adaptador } = adaptadorFalso();

    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(0);
    expect(chamadas).toHaveLength(0);
    expect((await followup(followupId)).status).toBe("aprovado");

    // Com 19 de 20, o aprovado sai.
    await db().query(
      "update wakeclub.followups set enviado_em = now() - interval '2 days' where id = $1::uuid",
      [enviados[0].followupId],
    );
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(1);
    expect((await followup(followupId)).status).toBe("enviado");
  });

  test("aprovado há mais de 3 dias sem IA é pulado e o seguinte sai", async () => {
    const velho = await cenario({ aprovadoHa: "4 days" });
    const novo = await cenario({ aprovadoHa: "1 minute" });
    const { adaptador } = adaptadorFalso();
    expect(await tarefaEnvioFollowups({ adaptador, agora: MEIO_DIA })).toBe(1);
    expect((await followup(velho.followupId)).status).toBe("aprovado");
    expect((await followup(novo.followupId)).status).toBe("enviado");
  });

  test("aprovado há mais de 3 dias barrado pelo porteiro sai da fila com motivo", async () => {
    const velho = await cenario({ aprovadoHa: "4 days" });
    const novo = await cenario({ aprovadoHa: "1 minute" });
    const { adaptador } = adaptadorFalso();
    const porteiro = porteiroFalso({ enviar: false, motivo: "já comprou" });

    expect(await tarefaEnvioFollowups({ adaptador, ia: porteiro.ia, agora: MEIO_DIA })).toBe(1);

    expect(porteiro.chamadas).toHaveLength(1);
    expect(await followup(velho.followupId)).toMatchObject({
      status: "abortado",
      motivo_cancelamento: "porteiro na fila de envio: já comprou",
    });
    const { rows } = await db().query(
      `select agente, tipo_evento, motivo from wakeclub.eventos_automacao
        where entidade_tipo = 'followup' and entidade_id = $1::uuid`,
      [velho.followupId],
    );
    expect(rows).toEqual([
      {
        agente: "porteiro",
        tipo_evento: "followup_blocked",
        motivo: "porteiro na fila de envio: já comprou",
      },
    ]);
    expect(await avisos(velho.dono)).toMatchObject([
      {
        tipo: "aviso",
        titulo: "Follow-up barrado na fila: Lead Envio",
        corpo: "porteiro na fila de envio: já comprou",
      },
    ]);
    expect((await followup(novo.followupId)).status).toBe("enviado");
  });

  test("aprovado há mais de 3 dias liberado pelo porteiro é reconferido e sai", async () => {
    const velho = await cenario({ aprovadoHa: "4 days" });
    const { chamadas, adaptador } = adaptadorFalso();
    const porteiro = porteiroFalso({ enviar: true, motivo: "ok" });

    expect(await tarefaEnvioFollowups({ adaptador, ia: porteiro.ia, agora: MEIO_DIA })).toBe(1);

    expect(chamadas).toHaveLength(1);
    const f = await followup(velho.followupId);
    expect(f.status).toBe("enviado");
    expect(f.reconferido_em).not.toBeNull();
  });

  test("erro do porteiro conta como barrado", async () => {
    const velho = await cenario({ aprovadoHa: "4 days" });
    await db().query(
      `update wakeclub.leads set atendente_id = null
        where id = (select lead_id from wakeclub.followups where id = $1::uuid)`,
      [velho.followupId],
    );
    const { chamadas, adaptador } = adaptadorFalso();
    const porteiro = porteiroFalso({ enviar: true, motivo: "ok" });

    expect(await tarefaEnvioFollowups({ adaptador, ia: porteiro.ia, agora: MEIO_DIA })).toBe(0);

    expect(chamadas).toHaveLength(0);
    expect(await followup(velho.followupId)).toMatchObject({
      status: "abortado",
      motivo_cancelamento: "porteiro na fila de envio: follow-up não encontrado",
    });
  });
});
