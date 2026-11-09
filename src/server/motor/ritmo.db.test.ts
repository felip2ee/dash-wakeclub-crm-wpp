import { describe, expect, test } from "bun:test";

import { getPoolMotor } from "../db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import {
  definirRitmo,
  lerRitmo,
  enviadosHoje,
  tarefaExpirarFollowups,
  tarefaRitmoMeiaNoite,
} from "./ritmo";

const db = () => getPoolMotor();
const CONFIG_ID = "00000000-0000-0000-0000-000000000001";

async function eventosConfig(tipo: string) {
  const { rows } = await db().query(
    `select lead_id, entidade_tipo, entidade_id, estado_novo, origem_tipo
       from wakeclub.eventos_automacao where tipo_evento = $1::text order by id`,
    [tipo],
  );
  return rows;
}

/**
 * Follow-up aguardando aprovação com `sugerido_em = now() + intervalo`, `expira_em` (null =
 * legado sem validade) e push pendente.
 */
async function aguardando(intervalo: string, expiraEm: string | null = null) {
  const dono = await criarVendedor("Vendedora Ritmo");
  const { rows } = await db().query<{ id: string }>(
    `with l as (
       insert into wakeclub.leads (telefone, nome, atendente_id)
       values ($1::text, 'Lead Ritmo', $2::uuid) returning id
     )
     insert into wakeclub.followups
       (lead_id, agendado_para, tipo, status, texto_sugerido, sugerido_em, expira_em)
     select l.id, now(), 'reengajar', 'aguardando_aprovacao', 'Oi, tudo certo?',
            now() + $3::interval, $4::timestamptz
       from l
     returning id`,
    [telefoneUnico(), dono, intervalo, expiraEm],
  );
  const id = rows[0].id;
  await db().query(
    `insert into wakeclub.notificacoes (usuario_id, followup_id, tipo, titulo, url)
     values ($1::uuid, $2::uuid, 'followup', 'Follow-up pronto', '/aprovar')`,
    [dono, id],
  );
  return id;
}

async function estado(followupId: string) {
  const { rows } = await db().query(
    `select f.status,
            (select n.status from wakeclub.notificacoes n where n.followup_id = f.id) as push,
            (select count(*)::int from wakeclub.eventos_automacao e
              where e.entidade_id = f.id and e.tipo_evento = 'followup_expired') as eventos
       from wakeclub.followups f where f.id = $1::uuid`,
    [followupId],
  );
  return rows[0];
}

describe.skipIf(!bancoTesteAtivo)("ritmo", () => {
  test("definirRitmo grava modo e evento de config", async () => {
    const admin = await criarVendedor("Admin Ritmo");
    await definirRitmo(db(), "aquecido", admin);
    const r = await lerRitmo(db());
    expect(r.modo).toBe("aquecido");
    expect(r.ligadoEm).not.toBeNull();

    const ev = (await eventosConfig("rhythm_changed")).at(-1);
    expect(ev).toMatchObject({
      lead_id: null,
      entidade_tipo: "config",
      entidade_id: CONFIG_ID,
      origem_tipo: "painel",
      estado_novo: { modo: "aquecido" },
    });

    await definirRitmo(db(), "conservador", admin);
    expect((await lerRitmo(db())).modo).toBe("conservador");
  });

  test("aquecido volta a conservador apos meia-noite", async () => {
    const admin = await criarVendedor("Admin Meia-noite");
    await definirRitmo(db(), "aquecido", admin);
    // Ligado hoje: fica.
    expect(await tarefaRitmoMeiaNoite(db())).toBe(0);
    expect((await lerRitmo(db())).modo).toBe("aquecido");

    await db().query(
      `update wakeclub.configuracoes
          set valor = jsonb_set(valor, '{ligado_em}', to_jsonb(now() - interval '1 day'))
        where chave = 'ritmo'`,
    );
    const antes = (await eventosConfig("rhythm_reset")).length;
    expect(await tarefaRitmoMeiaNoite(db())).toBe(1);
    expect((await lerRitmo(db())).modo).toBe("conservador");
    const evs = await eventosConfig("rhythm_reset");
    expect(evs).toHaveLength(antes + 1);
    expect(evs.at(-1)).toMatchObject({
      entidade_tipo: "config",
      estado_novo: { modo: "conservador" },
    });

    // Conservador não reseta de novo.
    expect(await tarefaRitmoMeiaNoite(db())).toBe(0);
  });

  test("enviadosHoje conta enviado_em do dia de São Paulo, não preparo", async () => {
    const antes = await enviadosHoje(db());
    await aguardando("0 minutes");
    const hoje = await aguardando("0 minutes");
    const ontem = await aguardando("0 minutes");
    await db().query(
      `update wakeclub.followups
          set status = 'enviado',
              enviado_em = case when id = $1::uuid then now() else now() - interval '2 days' end
        where id in ($1::uuid, $2::uuid)`,
      [hoje, ontem],
    );
    expect(await enviadosHoje(db())).toBe(antes + 1);
  });

  test("sugestão sem decisão não vence, mesmo com expira_em antigo", async () => {
    const antiga = await aguardando("-3 days", new Date(Date.now() - 86_400_000).toISOString());
    expect(await tarefaExpirarFollowups(db())).toBe(0);
    expect(await estado(antiga)).toEqual({
      status: "aguardando_aprovacao",
      push: "pendente",
      eventos: 0,
    });
  });

  test("lembrete aberto com aula já passada é cancelado; o de aula futura fica", async () => {
    const dono = await criarVendedor("Vendedora Lembrete");
    const { rows } = await db().query<{ id: string; tipo: string }>(
      `with l as (
         insert into wakeclub.leads (telefone, nome, atendente_id)
         values ($1::text, 'Lead Lembrete', $2::uuid) returning id
       )
       insert into wakeclub.followups (lead_id, agendado_para, tipo, status, aula_em,
                                       aprovado_em, aprovado_por)
       select l.id, now(), v.tipo, v.status, now() + v.aula::interval, now(), $2::uuid
         from l, (values ('lembrete_d1', 'aprovado', '-1 hour'),
                         ('lembrete_dia', 'pendente', '2 hours')) v(tipo, status, aula)
       returning id, tipo`,
      [telefoneUnico(), dono],
    );
    const porTipo = Object.fromEntries(rows.map((r) => [r.tipo, r.id]));

    await tarefaExpirarFollowups(db());

    const lido = await db().query(
      `select f.tipo, f.status, f.motivo_cancelamento,
              (select array_agg(e.tipo_evento) from wakeclub.eventos_automacao e
                where e.entidade_id = f.id) as eventos
         from wakeclub.followups f where f.id = any($1::uuid[]) order by f.tipo`,
      [Object.values(porTipo)],
    );
    expect(lido.rows).toEqual([
      {
        tipo: "lembrete_d1",
        status: "cancelado",
        motivo_cancelamento: "aula já passou",
        eventos: ["followup_cancelled"],
      },
      { tipo: "lembrete_dia", status: "pendente", motivo_cancelamento: null, eventos: null },
    ]);
  });
});
