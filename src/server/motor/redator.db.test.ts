import { beforeEach, describe, expect, test } from "bun:test";

import { getPoolMotor } from "../db";
import { VERSAO_PROMPT as VERSAO_PORTEIRO } from "../ia/prompts/porteiro";
import { VERSAO_PROMPT as VERSAO_REDATOR } from "../ia/prompts/redator";
import type { ClienteIa, PedidoChat } from "../ia/tipos";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import { avaliarPorteiro, blocoRevisoes, redigir, tarefaRedator } from "./redator";

const db = () => getPoolMotor();
// 12h em São Paulo: dentro da janela, qualquer que seja a hora real do teste.
const MEIO_DIA = new Date("2026-11-04T12:00:00-03:00");

type Respostas = Record<string, { porteiro?: unknown; redator?: unknown }>;

/**
 * IA falsa que responde pelo nome do lead no prompt: follow-ups vencidos que outros
 * arquivos de teste deixaram no banco recebem erro (só são reagendados) e não consomem
 * as respostas preparadas aqui.
 */
function iaPorLead(respostas: Respostas) {
  const chamadas: PedidoChat[] = [];
  const ia: ClienteIa = {
    async chatJson<T>(p: PedidoChat) {
      chamadas.push(p);
      const nome = /\nLEAD: (.*)\n/.exec(p.usuario)?.[1] ?? "";
      const r = respostas[nome]?.[p.modelo === "gpt-5.4" ? "redator" : "porteiro"];
      if (r === undefined) throw new Error("sem resposta para " + nome);
      if (r instanceof Error) throw r;
      // Função: efeito colateral durante a chamada (ex.: a conversa cancela o follow-up).
      return (typeof r === "function" ? await (r as () => Promise<unknown>)() : r) as T;
    },
    async transcrever() {
      throw new Error("não usado");
    },
  };
  return {
    ia,
    chamadas,
    leads: (n: string[]) =>
      chamadas.filter((c) => n.some((x) => c.usuario.includes("LEAD: " + x + "\n"))),
  };
}

let seq = 0;
/** Lead com dono e um follow-up pendente vencido há anos (fica à frente dos outros). */
async function vencido(
  o: { etiqueta?: string; temperatura?: string; horas?: number; anos?: number } = {},
) {
  const dono = await criarVendedor("Isadora Souza");
  const nome = `Lead Redator ${++seq} ${telefoneUnico()}`;
  const { rows } = await db().query<{ id: string; lead_id: string }>(
    `with l as (
       insert into wakeclub.leads (telefone, nome, atendente_id, etiqueta, temperatura, horas_estimadas)
       values ($1::text, $2::text, $3::uuid, $4::text, $5::text, $6::smallint) returning id
     )
     insert into wakeclub.followups (lead_id, agendado_para, tipo, motivo)
     select l.id, now() - make_interval(years => $7::int), 'reengajar', 'sumiu' from l
     returning id, lead_id`,
    [
      telefoneUnico(),
      nome,
      dono,
      o.etiqueta ?? "Em atendimento",
      o.temperatura ?? "morno",
      o.horas ?? 1,
      o.anos ?? 10,
    ],
  );
  return { ...rows[0], dono, nome };
}

async function followup(id: string) {
  const { rows } = await db().query(
    `select status, texto_sugerido, sugerido_em, motivo_cancelamento,
            agendado_para > now() + interval '29 minutes' as adiado_30,
            to_char(agendado_para at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as quando,
            agendado_para < now() - interval '1 year' as intocado,
            to_char(expira_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') as expira
       from wakeclub.followups where id = $1::uuid`,
    [id],
  );
  return rows[0];
}

async function eventos(followupId: string) {
  const { rows } = await db().query(
    `select agente, tipo_evento, origem_tipo, correlacao_id, modelo, versao_prompt, metadados
       from wakeclub.eventos_automacao where entidade_id = $1::uuid order by id`,
    [followupId],
  );
  return rows;
}

const carimbo = async (intervalo: string) =>
  (
    await db().query<{ c: string }>(
      `select to_char((now() + $1::interval) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as c`,
      [intervalo],
    )
  ).rows[0].c;

/** `n` follow-ups encerrados preparados hoje, para gastar a cota do dia. */
async function gastarCota(n: number) {
  await db().query(
    `with l as (insert into wakeclub.leads (telefone) values ($1::text) returning id)
     insert into wakeclub.followups (lead_id, agendado_para, tipo, status, sugerido_em)
     select l.id, now(), 'reengajar', 'expirado', now() from l, generate_series(1, $2::int)`,
    [telefoneUnico(), n],
  );
}

/** Data de São Paulo daqui a `dias` dias, com a hora em que a sugestão expira. */
const fimDaJanela = async (dias: number) =>
  (
    await db().query<{ c: string }>(
      `select to_char((now() at time zone 'America/Sao_Paulo')::date + $1::int, 'YYYY-MM-DD')
              || ' 19:59:59' as c`,
      [dias],
    )
  ).rows[0].c;

/** Revisão do admin sobre uma decisão da atendente num follow-up já usado. */
async function revisar(followupId: string, atendente: string, admin: string, texto: string) {
  const { rows } = await db().query<{ id: string }>(
    `insert into wakeclub.followup_avaliacoes (followup_id, usuario_id, decisao, motivos, texto_original)
     values ($1::uuid, $2::uuid, 'recusar', '{Tom errado}', $3::text) returning id`,
    [followupId, atendente, texto],
  );
  await db().query(
    `insert into wakeclub.followup_revisoes (avaliacao_id, admin_id, concorda, observacao)
     values ($1::uuid, $2::uuid, false, 'estava bom')`,
    [rows[0].id, admin],
  );
}

/** Só os follow-ups do teste vencidos: os que outros testes deixaram vão para amanhã. */
const adiarOsOutros = () =>
  db().query(
    `update wakeclub.followups set agendado_para = now() + interval '1 day'
      where status = 'pendente' and agendado_para <= now()`,
  );

describe.skipIf(!bancoTesteAtivo)("redator", () => {
  beforeEach(async () => {
    await db().query(
      `update wakeclub.configuracoes set valor = '{"modo":"conservador"}' where chave = 'ritmo'`,
    );
  });

  test("porteiro barra sem data aborta", async () => {
    const f = await vencido();
    const { ia } = iaPorLead({
      [f.nome]: { porteiro: { enviar: false, motivo: "conversa viva" } },
    });

    await tarefaRedator({ ia, agora: MEIO_DIA });

    expect(await followup(f.id)).toMatchObject({
      status: "abortado",
      motivo_cancelamento: "conversa viva",
    });
    const evs = await eventos(f.id);
    expect(evs.map((e) => [e.agente, e.tipo_evento])).toEqual([["porteiro", "followup_blocked"]]);
    expect(evs[0]).toMatchObject({
      origem_tipo: "motor",
      modelo: "gpt-5.4-mini",
      versao_prompt: VERSAO_PORTEIRO,
    });
    expect(evs[0].correlacao_id).toStartWith("motor:red:");
    expect(evs[0].correlacao_id).toEndWith(":" + f.id);
  });

  test("porteiro reagenda", async () => {
    const f = await vencido();
    const quando = await carimbo("3 days");
    const { ia } = iaPorLead({
      [f.nome]: {
        porteiro: { enviar: false, motivo: "pediu semana que vem", reagendar_para: quando },
      },
    });

    await tarefaRedator({ ia, agora: MEIO_DIA });

    expect(await followup(f.id)).toMatchObject({
      status: "pendente",
      quando,
      texto_sugerido: null,
    });
    expect((await eventos(f.id)).map((e) => e.tipo_evento)).toEqual(["followup_rescheduled"]);
  });

  test("redator grava aguardando_aprovacao, evento e push", async () => {
    const f = await vencido({ etiqueta: "Aguardando pagamento", temperatura: "quente" });
    // Uma recusa revisada pelo admin volta no prompt de sistema dos dois.
    const velho = await vencido({ anos: 0 });
    await revisar(velho.id, f.dono, await criarVendedor("Admin"), "Texto velho");
    const { ia, leads } = iaPorLead({
      [f.nome]: {
        porteiro: { enviar: true, motivo: "faz sentido" },
        redator: { texto: "Oi, conseguiu ver o pagamento? 🙂" },
      },
    });

    expect(await tarefaRedator({ ia, agora: MEIO_DIA })).toBeGreaterThanOrEqual(1);

    const [p, r] = leads([f.nome]);
    expect(p).toMatchObject({ modelo: "gpt-5.4-mini", reasoningEffort: "low", timeoutMs: 60000 });
    expect(r).toMatchObject({ modelo: "gpt-5.4", reasoningEffort: "medium", timeoutMs: 90000 });
    for (const c of [p, r]) {
      expect(c.sistema).toContain(
        '"Texto velho" → atendente: recusar (Tom errado) → admin: Discordo: estava bom',
      );
      expect(c.sistema).not.toContain("{{AVALIACOES}}");
    }

    const fu = await followup(f.id);
    expect(fu).toMatchObject({
      status: "aguardando_aprovacao",
      texto_sugerido: "Oi, conseguiu ver o pagamento?",
      expira: await fimDaJanela(0),
    });
    expect(fu.sugerido_em).not.toBeNull();

    const evs = await eventos(f.id);
    // A liberação do porteiro só entra depois do texto gravado (sem liberação órfã).
    expect(evs.map((e) => e.tipo_evento)).toEqual(["message_generated", "followup_approved"]);
    expect(evs[0]).toMatchObject({
      agente: "redator",
      origem_tipo: "motor",
      modelo: "gpt-5.4",
      versao_prompt: VERSAO_REDATOR,
      metadados: { modo: "RETOMAR", tipo: "reengajar", tem_link: false },
    });

    const { rows } = await db().query(
      "select usuario_id, tipo, titulo, url, status from wakeclub.notificacoes where followup_id = $1::uuid",
      [f.id],
    );
    expect(rows).toEqual([
      {
        usuario_id: f.dono,
        tipo: "followup",
        titulo: "Follow-up pronto: " + f.nome,
        url: "/aprovar",
        status: "pendente",
      },
    ]);
  });

  test("prepara sem cota: 60 já preparados hoje não param a rodada", async () => {
    await adiarOsOutros();
    await gastarCota(60);
    const f = await vencido();
    const { ia } = iaPorLead({
      [f.nome]: { porteiro: { enviar: true, motivo: "ok" }, redator: { texto: "Oi, tudo certo?" } },
    });

    expect(await tarefaRedator({ ia, agora: MEIO_DIA })).toBe(1);
    expect(await followup(f.id)).toMatchObject({
      status: "aguardando_aprovacao",
      expira: await fimDaJanela(0),
    });
  });

  test("a rodada leva os 10 vencidos de maior valor esperado", async () => {
    await adiarOsOutros();
    // Do mais antigo (1º) ao mais novo (12º), chance × horas crescente: 0,04 … 1,4. Os 10
    // de maior valor são do 12º ao 3º; os 2 mais antigos ficam para a próxima.
    const perfis: [string, string, number][] = [
      ["Em atendimento", "frio", 1],
      ["Novo lead", "morno", 1],
      ["Em atendimento", "frio", 2],
      ["Novo lead", "morno", 2],
      ["Em atendimento", "morno", 1],
      ["Aluno sem horas", "morno", 1],
      ["Link enviado", "morno", 1],
      ["Em atendimento", "quente", 1],
      ["Cadastrado", "morno", 1],
      ["Link enviado", "quente", 1],
      ["Aguardando pagamento", "quente", 1],
      ["Aguardando pagamento", "quente", 2],
    ];
    const fs = await Promise.all(
      perfis.map(([etiqueta, temperatura, horas], i) =>
        vencido({ etiqueta, temperatura, horas, anos: 30 - i }),
      ),
    );
    const libera = {
      porteiro: { enviar: true, motivo: "ok" },
      redator: { texto: "Oi, tudo certo por aí?" },
    };
    const { ia, leads } = iaPorLead(Object.fromEntries(fs.map((f) => [f.nome, libera])));

    expect(await tarefaRedator({ ia, agora: MEIO_DIA })).toBe(10);

    const porteiro = leads(fs.map((f) => f.nome)).filter((x) => x.modelo === "gpt-5.4-mini");
    expect(porteiro.map((x) => fs.findIndex((f) => x.usuario.includes(f.nome)))).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
    for (const [i, f] of fs.entries()) {
      const fu = await followup(f.id);
      expect(fu.status).toBe(i >= 2 ? "aguardando_aprovacao" : "pendente");
      // Toda sugestão que espera aprovação tem validade (a aprovação só expira com ela).
      if (i >= 2) expect(fu.expira).toBe(await fimDaJanela(0));
    }
  });

  test("liberação sem texto gravado não deixa evento", async () => {
    const f = await vencido();
    const { ia } = iaPorLead({
      [f.nome]: {
        porteiro: { enviar: true, motivo: "ok" },
        // O lead respondeu enquanto a IA escrevia: a conversa viva cancelou o follow-up.
        redator: async () => {
          await db().query(
            "update wakeclub.followups set status = 'cancelado' where id = $1::uuid",
            [f.id],
          );
          return { texto: "Oi, tudo certo por aí?" };
        },
      },
    });

    expect(await tarefaRedator({ ia, agora: MEIO_DIA })).toBe(0);

    expect(await followup(f.id)).toMatchObject({ status: "cancelado", texto_sugerido: null });
    expect(await eventos(f.id)).toEqual([]);
  });

  test("fora da janela nao roda", async () => {
    const f = await vencido();
    const { ia, chamadas } = iaPorLead({});

    expect(await tarefaRedator({ ia, agora: new Date("2026-11-04T20:00:00-03:00") })).toBe(0);
    expect(await tarefaRedator({ ia, agora: new Date("2026-11-04T07:59:00-03:00") })).toBe(0);

    expect(chamadas).toEqual([]);
    expect(await followup(f.id)).toMatchObject({ status: "pendente", intocado: true });
  });

  test("falha reagenda +30 min", async () => {
    const f1 = await vencido();
    const f2 = await vencido();
    const { ia } = iaPorLead({
      [f1.nome]: { porteiro: new Error("timeout") },
      [f2.nome]: { porteiro: { enviar: true, motivo: "ok" }, redator: { texto: "🙂 oi" } },
    });

    await tarefaRedator({ ia, agora: MEIO_DIA });

    for (const f of [f1, f2]) {
      expect(await followup(f.id)).toMatchObject({
        status: "pendente",
        adiado_30: true,
        texto_sugerido: null,
      });
      expect(await eventos(f.id)).toEqual([]);
    }
  });

  test("redigir: validade de hoje (automático) ou de amanhã (varredura)", async () => {
    const hoje = await vencido();
    const amanha = await vencido();
    const barrado = await vencido();
    const libera = {
      porteiro: { enviar: true, motivo: "ok" },
      redator: { texto: "Oi, tudo certo?" },
    };
    const { ia } = iaPorLead({
      [hoje.nome]: libera,
      [amanha.nome]: libera,
      [barrado.nome]: { porteiro: { enviar: false, motivo: "já comprou" } },
    });
    const parciais: number[] = [];

    expect(await redigir(db(), ia, [hoje.id], { diasValidade: 0 })).toEqual({
      sugeridos: 1,
      barrados: [],
      reagendados: 0,
      falhas: 0,
    });
    expect(
      await redigir(db(), ia, [amanha.id, barrado.id], {
        diasValidade: 1,
        aoConcluirUm: async (p) => void parciais.push(p.sugeridos + p.barrados.length),
      }),
    ).toEqual({
      sugeridos: 1,
      barrados: [{ followupId: barrado.id, motivo: "já comprou" }],
      reagendados: 0,
      falhas: 0,
    });
    expect(parciais).toEqual([1, 2]);

    expect((await followup(hoje.id)).expira).toBe(await fimDaJanela(0));
    expect((await followup(amanha.id)).expira).toBe(await fimDaJanela(1));
    expect(await followup(barrado.id)).toMatchObject({ status: "abortado", expira: null });
  });

  test("blocoRevisoes: só decisão revisada pelo admin entra", async () => {
    const f = await vencido({ anos: 0 });
    const g = await vencido({ anos: 0 });
    const sem = "Sem revisão " + telefoneUnico();
    const com = "Revisada " + telefoneUnico();
    await db().query(
      `insert into wakeclub.followup_avaliacoes (followup_id, usuario_id, decisao, motivos, texto_original)
       values ($1::uuid, $2::uuid, 'recusar', '{Cedo demais}', $3::text)`,
      [f.id, f.dono, sem],
    );
    await revisar(g.id, g.dono, await criarVendedor("Admin"), com);

    const bloco = await blocoRevisoes(db());
    expect(bloco).toStartWith("REVISOES DO ADMIN SOBRE DECISOES DA EQUIPE (calibre-se por elas)\n");
    expect(bloco).toContain('"' + com + '" → atendente: recusar (Tom errado) → admin: Discordo');
    expect(bloco).not.toContain(sem);
  });

  test("avaliarPorteiro reconsulta um aprovado sem mudar nada", async () => {
    const f = await vencido();
    await db().query(
      `update wakeclub.followups set status = 'aprovado', texto_sugerido = 'Oi, tudo certo?',
              sugerido_em = now() where id = $1::uuid`,
      [f.id],
    );
    const quando = await carimbo("3 days");
    const barra = iaPorLead({ [f.nome]: { porteiro: { enviar: false, motivo: "já comprou" } } });
    const adia = iaPorLead({
      [f.nome]: { porteiro: { enviar: false, motivo: "viajando", reagendar_para: quando } },
    });
    const libera = iaPorLead({ [f.nome]: { porteiro: { enviar: true, motivo: "ok" } } });

    expect(await avaliarPorteiro(db(), barra.ia, f.id)).toEqual({
      enviar: false,
      motivo: "já comprou",
    });
    expect(await avaliarPorteiro(db(), adia.ia, f.id)).toEqual({
      enviar: false,
      motivo: "viajando",
    });
    expect(await avaliarPorteiro(db(), libera.ia, f.id)).toEqual({ enviar: true, motivo: "ok" });
    expect(barra.chamadas[0].usuario).toContain("FOLLOW-UP EM QUESTAO");
    expect(await followup(f.id)).toMatchObject({
      status: "aprovado",
      texto_sugerido: "Oi, tudo certo?",
    });
    expect(await eventos(f.id)).toEqual([]);
  });
});
