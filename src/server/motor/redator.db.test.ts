import { beforeEach, describe, expect, test } from "bun:test";

import { getPoolMotor } from "../db";
import { VERSAO_PROMPT as VERSAO_PORTEIRO } from "../ia/prompts/porteiro";
import { VERSAO_PROMPT as VERSAO_REDATOR } from "../ia/prompts/redator";
import type { ClienteIa, PedidoChat } from "../ia/tipos";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import { tarefaRedator } from "./redator";

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
      o.etiqueta ?? "Atendimento",
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
            agendado_para < now() - interval '1 year' as intocado
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

/** Cota do dia livre: o que outros testes prepararam hoje passa a ser de ontem. */
const liberarCota = () =>
  db().query(
    `update wakeclub.followups set sugerido_em = sugerido_em - interval '1 day'
      where (sugerido_em at time zone 'America/Sao_Paulo')::date
          = (now() at time zone 'America/Sao_Paulo')::date`,
  );

describe.skipIf(!bancoTesteAtivo)("redator", () => {
  beforeEach(async () => {
    await liberarCota();
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
    // Uma recusa do próprio vendedor volta no prompt de sistema dos dois.
    const velho = await vencido({ anos: 0 });
    await db().query(
      `insert into wakeclub.followup_avaliacoes (followup_id, usuario_id, decisao, motivos, texto_original)
       values ($1::uuid, $2::uuid, 'recusar', '{Tom errado}', 'Texto velho')`,
      [velho.id, f.dono],
    );
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
      expect(c.sistema).toContain('"Texto velho" → recusar → Tom errado');
      expect(c.sistema).not.toContain("{{AVALIACOES}}");
    }

    const fu = await followup(f.id);
    expect(fu).toMatchObject({
      status: "aguardando_aprovacao",
      texto_sugerido: "Oi, conseguiu ver o pagamento?",
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

  test("cota corta a rodada; vencidos por valor esperado desc", async () => {
    // A é o mais antigo, mas B vale mais (4h × 360 × 0,7) que C (2h × 360 × 0,15) e A.
    const a = await vencido({ etiqueta: "Atendimento", temperatura: "frio", horas: 1, anos: 12 });
    const b = await vencido({
      etiqueta: "Aguardando pagamento",
      temperatura: "quente",
      horas: 4,
      anos: 11,
    });
    const c = await vencido({ etiqueta: "Follow-up", temperatura: "morno", horas: 2, anos: 10 });
    const libera = {
      porteiro: { enviar: true, motivo: "ok" },
      redator: { texto: "Oi, tudo certo por aí?" },
    };
    const { ia, leads } = iaPorLead({ [a.nome]: libera, [b.nome]: libera, [c.nome]: libera });

    await gastarCota(20);
    expect(await tarefaRedator({ ia, agora: MEIO_DIA })).toBe(0);
    expect(leads([a.nome, b.nome, c.nome])).toEqual([]);

    // Na próxima, com uma vaga só: vai o de maior valor e a rodada para.
    await liberarCota();
    await gastarCota(19);
    await tarefaRedator({ ia, agora: MEIO_DIA });

    const chamadas = leads([a.nome, b.nome, c.nome]);
    expect(chamadas.map((x) => x.modelo)).toEqual(["gpt-5.4-mini", "gpt-5.4"]);
    expect(chamadas[0].usuario).toContain("LEAD: " + b.nome + "\n");
    expect((await followup(b.id)).status).toBe("aguardando_aprovacao");
    for (const x of [a, c])
      expect(await followup(x.id)).toMatchObject({ status: "pendente", intocado: true });

    // Cota livre de novo: C (108) antes de A (14,4).
    await liberarCota();
    await tarefaRedator({ ia, agora: MEIO_DIA });
    const nomes = leads([a.nome, c.nome]).filter((x) => x.modelo === "gpt-5.4-mini");
    expect(nomes.map((x) => x.usuario.includes(c.nome))).toEqual([true, false]);
  });

  test("vagas do dia vão aos de maior valor entre todos os vencidos", async () => {
    // Só os follow-ups deste teste vencidos: os que outros testes deixaram vão para amanhã.
    await db().query(
      `update wakeclub.followups set agendado_para = now() + interval '1 day'
        where status = 'pendente' and agendado_para <= now()`,
    );
    // Do mais antigo (1º) ao mais novo (12º), valor crescente: 14,4 … 504. Os 3 de maior
    // valor são o 12º, o 11º e o 10º, fora dos 10 mais antigos.
    const perfis: [string, string, number][] = [
      ["Atendimento", "frio", 1],
      ["Novo Lead", "morno", 1],
      ["Atendimento", "frio", 2],
      ["Novo Lead", "morno", 2],
      ["Atendimento", "morno", 1],
      ["Follow-up", "morno", 1],
      ["Link enviado", "morno", 1],
      ["Atendimento", "quente", 1],
      ["Follow-up", "quente", 1],
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

    await gastarCota(17);
    expect(await tarefaRedator({ ia, agora: MEIO_DIA })).toBe(3);

    const porteiro = leads(fs.map((f) => f.nome)).filter((x) => x.modelo === "gpt-5.4-mini");
    expect(porteiro.map((x) => fs.findIndex((f) => x.usuario.includes(f.nome)))).toEqual([
      11, 10, 9,
    ]);
    for (const [i, f] of fs.entries()) {
      expect((await followup(f.id)).status).toBe(i >= 9 ? "aguardando_aprovacao" : "pendente");
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
});
