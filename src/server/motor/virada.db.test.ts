import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { comTransacao, getPoolMotor } from "../db";
import { bancoTesteAtivo, telefoneUnico } from "./banco-teste";

const sql = readFileSync(
  new URL("../../../db/migrations/0003_virada.sql", import.meta.url),
  "utf8",
);
const db = () => getPoolMotor();

async function lead(qualificar: boolean, atendente: string | null = null): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `insert into wakeclub.leads (telefone, atendente_id, qualificar_apos)
     values ($1::text, $2::uuid, case when $3::boolean then now() + interval '1 hour' end)
     returning id`,
    [telefoneUnico(), atendente, qualificar],
  );
  return rows[0].id;
}

describe.skipIf(!bancoTesteAtivo)("0003_virada (corte)", () => {
  test("cancela follow-ups, zera qualificar_apos, audita e preserva o dono", async () => {
    const { rows: u } = await db().query<{ id: string }>(
      "select id from wakeclub.usuarios limit 1",
    );
    const dono = u[0]?.id ?? null;
    const comFila = await lead(true, dono);
    const semFila = await lead(false);
    const { rows: f } = await db().query<{ id: string }>(
      `insert into wakeclub.followups (lead_id, agendado_para, tipo)
       values ($1::uuid, now() + interval '1 day', 'reengajar') returning id`,
      [comFila],
    );
    const { rows: n } = await db().query<{ id: string }>(
      `insert into wakeclub.notificacoes (tipo, titulo, followup_id)
       values ('followup', 'x', $1::uuid) returning id`,
      [f[0].id],
    );

    await comTransacao((c) => c.query(sql));
    await comTransacao((c) => c.query(sql)); // idempotente

    const q = async (t: string, p: unknown[]) => (await db().query(t, p)).rows;
    expect(await q("select 1 from wakeclub.followups where status = 'pendente'", [])).toHaveLength(
      0,
    );
    expect(
      await q("select 1 from wakeclub.leads where qualificar_apos is not null", []),
    ).toHaveLength(0);
    expect(
      (await q("select status, erro from wakeclub.notificacoes where id = $1", [n[0].id]))[0],
    ).toMatchObject({
      status: "cancelada",
    });
    expect(
      (await q("select atendente_id from wakeclub.leads where id = $1::uuid", [comFila]))[0]
        .atendente_id,
    ).toBe(dono);

    const ev = (tipo: string, id: string) =>
      q(
        "select 1 from wakeclub.eventos_automacao where tipo_evento = $1 and entidade_id = $2::uuid",
        [tipo, id],
      );
    expect(await ev("followup_cancelled", f[0].id)).toHaveLength(1);
    expect(await ev("qualification_cleared", comFila)).toHaveLength(1);
    expect(await ev("qualification_cleared", semFila)).toHaveLength(0);
  });
});
