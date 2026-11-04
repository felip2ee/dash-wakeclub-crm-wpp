import { describe, expect, test } from "bun:test";

import { getPoolMotor } from "../db";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import {
  definirRitmo,
  lerRitmo,
  preparadosHoje,
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

/** Follow-up aguardando aprovação com `sugerido_em = now() + intervalo` e push pendente. */
async function aguardando(intervalo: string) {
  const dono = await criarVendedor("Vendedora Ritmo");
  const { rows } = await db().query<{ id: string }>(
    `with l as (
       insert into wakeclub.leads (telefone, nome, atendente_id)
       values ($1::text, 'Lead Ritmo', $2::uuid) returning id
     )
     insert into wakeclub.followups
       (lead_id, agendado_para, tipo, status, texto_sugerido, sugerido_em)
     select l.id, now(), 'reengajar', 'aguardando_aprovacao', 'Oi, tudo certo?',
            now() + $3::interval
       from l
     returning id`,
    [telefoneUnico(), dono, intervalo],
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

  test("preparadosHoje conta sugerido_em do dia de São Paulo", async () => {
    const antes = await preparadosHoje(db());
    await aguardando("0 minutes");
    await aguardando("-2 days");
    expect(await preparadosHoje(db())).toBe(antes + 1);
  });

  test("expira: sugerido ontem vira expirado e push é cancelado", async () => {
    const ontem = await aguardando("-1 day");

    await tarefaExpirarFollowups(db());

    expect(await estado(ontem)).toEqual({ status: "expirado", push: "cancelada", eventos: 1 });
    await tarefaExpirarFollowups(db());
    expect((await estado(ontem)).eventos).toBe(1);
  });

  test("expira as 19h59 do dia em que ficou pronto", async () => {
    const f = await aguardando("0 minutes");
    await db().query(
      "update wakeclub.followups set sugerido_em = $2::timestamptz where id = $1::uuid",
      [f, "2026-11-04T15:00:00-03:00"],
    );

    await tarefaExpirarFollowups(db(), new Date("2026-11-04T19:59:00-03:00"));
    expect((await estado(f)).status).toBe("aguardando_aprovacao");

    await tarefaExpirarFollowups(db(), new Date("2026-11-04T20:00:00-03:00"));
    expect(await estado(f)).toEqual({ status: "expirado", push: "cancelada", eventos: 1 });
  });
});
