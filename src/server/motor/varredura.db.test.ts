import { describe, expect, test } from "bun:test";

import { type ClienteDb, getPoolMotor } from "../db";
import type { ClienteIa, PedidoChat } from "../ia/tipos";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import { MODELO_REDATOR } from "./redator-sql";
import {
  destravarVarreduraPresa,
  executarVarredura,
  iniciarVarredura,
  lerVarreduraAtual,
} from "./varredura";

const db = () => getPoolMotor();

type Resposta = { porteiro: unknown; redator?: unknown };

/** IA falsa que responde pelo nome do lead; `espera` segura o porteiro até ser liberada. */
function iaPorLead(respostas: Record<string, Resposta>, espera?: Promise<void>): ClienteIa {
  return {
    async chatJson<T>(p: PedidoChat) {
      if (espera) await espera;
      const nome = /\nLEAD: (.*)\n/.exec(p.usuario)?.[1] ?? "";
      const r = respostas[nome]?.[p.modelo === MODELO_REDATOR ? "redator" : "porteiro"];
      if (r === undefined) throw new Error("sem resposta para " + nome);
      return r as T;
    },
    async transcrever() {
      throw new Error("não usado");
    },
  };
}

const LIBERA = { enviar: true, motivo: "lead parado há mais de um dia", reagendar_para: "" };
const BARRA = { enviar: false, motivo: "lead pediu para esperar", reagendar_para: "" };
const TEXTO = { texto: "Oi! Conseguiu ver o horário da aula? Te ajudo a escolher." };

let seq = 0;
let dono: string | undefined;
/** Lead em atendimento sem resposta há 25 h: parado pelo prazo padrão de 24 h. */
async function leadParado(): Promise<{ id: string; nome: string }> {
  dono ??= await criarVendedor("Isadora Varredura");
  const nome = `Lead Varredura ${++seq} ${telefoneUnico()}`;
  const { rows } = await db().query<{ id: string }>(
    `insert into wakeclub.leads (telefone, nome, atendente_id, etiqueta, ultima_msg_equipe_em)
     values ($1::text, $2::text, $3::uuid, 'Em atendimento', now() - interval '25 hours')
     returning id`,
    [telefoneUnico(), nome, dono],
  );
  return { id: rows[0].id, nome };
}

async function novaVarredura(): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    "insert into wakeclub.varreduras default values returning id",
  );
  return rows[0].id;
}

async function varredura(id: string) {
  const { rows } = await db().query(
    `select status, total, analisados, sugeridos, barrados, erro, concluida_em is not null as fim
       from wakeclub.varreduras where id = $1::uuid`,
    [id],
  );
  return rows[0];
}

async function followupsDe(leadIds: string[]) {
  const { rows } = await db().query<{ status: string; expira: string | null }>(
    `select status,
            to_char(expira_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') as expira
       from wakeclub.followups where lead_id = any($1::uuid[]) order by lead_id`,
    [leadIds],
  );
  return rows;
}

const amanha1959 = async () =>
  (
    await db().query<{ c: string }>(
      `select to_char((now() at time zone 'America/Sao_Paulo')::date + 1, 'YYYY-MM-DD')
              || ' 19:59:59' as c`,
    )
  ).rows[0].c;

async function esperarFim(id: string) {
  for (let i = 0; i < 200; i++) {
    if ((await varredura(id)).status !== "rodando") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a varredura não terminou");
}

describe.skipIf(!bancoTesteAtivo)("varredura", () => {
  test("3 parados viram 3 sugestões que expiram amanhã às 19h59, nunca aprovadas", async () => {
    const leads = [await leadParado(), await leadParado(), await leadParado()];
    const ia = iaPorLead(
      Object.fromEntries(leads.map((l) => [l.nome, { porteiro: LIBERA, redator: TEXTO }])),
    );
    const id = await novaVarredura();

    await executarVarredura(db(), ia, id);

    // total conta todo pendente vencido do banco; os desta suíte são conferidos em followupsDe.
    expect(await varredura(id)).toMatchObject({
      status: "concluida",
      total: expect.any(Number),
      sugeridos: 3,
      barrados: 0,
      erro: null,
      fim: true,
    });
    const v = (await varredura(id)) as { total: number; analisados: number };
    expect(v.total).toBeGreaterThanOrEqual(3);
    expect(v.analisados).toBe(v.total);
    const fs = await followupsDe(leads.map((l) => l.id));
    const limite = await amanha1959();
    expect(fs).toEqual([1, 2, 3].map(() => ({ status: "aguardando_aprovacao", expira: limite })));
    const { rows } = await db().query<{ n: number }>(
      `select count(*)::int as n from wakeclub.followups
        where lead_id = any($1::uuid[]) and status in ('aprovado', 'enviado', 'enviando')`,
      [leads.map((l) => l.id)],
    );
    expect(rows[0].n).toBe(0);
    const ev = await db().query(
      `select 1 from wakeclub.eventos_automacao
        where tipo_evento = 'sweep_finished' and metadados ->> 'varredura_id' = $1::text`,
      [id],
    );
    expect(ev.rowCount).toBe(1);
  });

  test("porteiro barrando um conta em barrados", async () => {
    const [a, b] = [await leadParado(), await leadParado()];
    const ia = iaPorLead({
      [a.nome]: { porteiro: LIBERA, redator: TEXTO },
      [b.nome]: { porteiro: BARRA },
    });
    const id = await novaVarredura();

    await executarVarredura(db(), ia, id);

    expect(await varredura(id)).toMatchObject({
      status: "concluida",
      sugeridos: 1,
      barrados: 1,
    });
  });

  test("falha ao gravar o progresso marca a varredura como falhou", async () => {
    const l = await leadParado();
    const ia = iaPorLead({ [l.nome]: { porteiro: LIBERA, redator: TEXTO } });
    const quebrado = {
      query: (sql: string, p?: unknown[]) =>
        sql.includes("analisados = ")
          ? Promise.reject(new Error("progresso caiu"))
          : db().query(sql, p),
    } as unknown as ClienteDb;
    const id = await novaVarredura();

    await executarVarredura(quebrado, ia, id);

    expect(await varredura(id)).toMatchObject({
      status: "falhou",
      erro: "progresso caiu",
      fim: true,
    });
  });

  test("só uma varredura por vez; a atual fica legível enquanto roda", async () => {
    const admin = await criarVendedor("Admin Varredura");
    const l = await leadParado();
    let liberar = () => {};
    const espera = new Promise<void>((r) => (liberar = r));
    const ia = iaPorLead({ [l.nome]: { porteiro: LIBERA, redator: TEXTO } }, espera);

    const { id } = await iniciarVarredura(db(), ia, admin);
    await expect(iniciarVarredura(db(), ia, admin)).rejects.toThrow(
      "Já existe uma varredura em andamento.",
    );
    expect(await lerVarreduraAtual(db())).toMatchObject({ id, status: "rodando" });
    const ev = await db().query(
      `select entidade_tipo from wakeclub.eventos_automacao
        where tipo_evento = 'sweep_started' and metadados ->> 'varredura_id' = $1::text`,
      [id],
    );
    expect(ev.rows).toEqual([{ entidade_tipo: "config" }]);

    liberar();
    await esperarFim(id);
    expect(await lerVarreduraAtual(db())).toMatchObject({
      id,
      status: "concluida",
      sugeridos: 1,
    });
    expect((await followupsDe([l.id]))[0].status).toBe("aguardando_aprovacao");
  });

  test("varredura presa em rodando há mais de 2 h vira falhou e não bloqueia a nova", async () => {
    const admin = await criarVendedor("Admin Varredura Presa");
    const l = await leadParado();
    const ia = iaPorLead({ [l.nome]: { porteiro: LIBERA, redator: TEXTO } });
    const presa = await novaVarredura();
    await db().query(
      "update wakeclub.varreduras set iniciada_em = now() - interval '3 hours' where id = $1::uuid",
      [presa],
    );

    const { id } = await iniciarVarredura(db(), ia, admin);
    await esperarFim(id);

    expect(await varredura(presa)).toMatchObject({
      status: "falhou",
      erro: "iniciada há mais de 2 h sem concluir (processo reiniciado?)",
      fim: true,
    });
    const ev = await db().query(
      `select 1 from wakeclub.eventos_automacao
        where tipo_evento = 'sweep_finished' and metadados ->> 'varredura_id' = $1::text`,
      [presa],
    );
    expect(ev.rowCount).toBe(1);
    expect(await varredura(id)).toMatchObject({ status: "concluida", sugeridos: 1 });
  });

  test("leitura do painel destrava a varredura presa sem iniciar outra", async () => {
    const presa = await novaVarredura();
    await db().query(
      "update wakeclub.varreduras set iniciada_em = now() - interval '3 hours' where id = $1::uuid",
      [presa],
    );

    await destravarVarreduraPresa(db());

    expect(await varredura(presa)).toMatchObject({ status: "falhou", fim: true });
    expect((await lerVarreduraAtual(db()))?.status).not.toBe("rodando");
  });
});
