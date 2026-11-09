import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import { getPoolMotor } from "../db";
import { bancoTesteAtivo, telefoneUnico } from "./banco-teste";

const codigo = (e: unknown) => (e as { code?: string }).code;

async function criarLead(): Promise<string> {
  const { rows } = await getPoolMotor().query<{ id: string }>(
    "insert into wakeclub.leads (telefone) values ($1::text) returning id",
    [telefoneUnico()],
  );
  return rows[0].id;
}

const inserirComprovante = (leadId: string, status: string, e2e: string | null = null) =>
  getPoolMotor()
    .query<{ id: string; tentativas: number }>(
      `insert into wakeclub.comprovantes (lead_id, status, e2e)
       values ($1::uuid, $2::text, $3::text) returning id, tentativas`,
      [leadId, status, e2e],
    )
    .catch((e) => e);

describe.skipIf(!bancoTesteAtivo)("migração 0009", () => {
  test("comprovantes existe: status válido entra com tentativas 0; inválido → 23514", async () => {
    const leadId = await criarLead();
    const ok = await inserirComprovante(leadId, "lendo");
    expect(ok.rows[0].tentativas).toBe(0);
    expect(codigo(await inserirComprovante(leadId, "pago"))).toBe("23514");
  });

  test("e2e repetido só é barrado entre comprovantes registrados (23505)", async () => {
    const leadId = await criarLead();
    const e2e = `E${crypto.randomUUID()}`;
    expect((await inserirComprovante(leadId, "registrado", e2e)).rows).toHaveLength(1);
    expect((await inserirComprovante(leadId, "repetido", e2e)).rows).toHaveLength(1);
    expect(codigo(await inserirComprovante(leadId, "registrado", e2e))).toBe("23505");
  });

  test("atualizado_em muda no update (trigger)", async () => {
    const motor = getPoolMotor();
    const leadId = await criarLead();
    const { id } = (await inserirComprovante(leadId, "lendo")).rows[0];
    await motor.query(
      "update wakeclub.comprovantes set atualizado_em = now() - interval '1 day' where id = $1::uuid",
      [id],
    );
    const { rows } = await motor.query<{ recente: boolean }>(
      `select atualizado_em > now() - interval '1 minute' as recente
         from wakeclub.comprovantes where id = $1::uuid`,
      [id],
    );
    expect(rows[0].recente).toBe(true);
  });

  test("vendas aceita vinculada_por = 'comprovante'", async () => {
    const r = await getPoolMotor().query(
      `insert into wakeclub.vendas (origem_externa, id_externo, comprada_em, valor, vinculada_por)
       values ('pix', $1::text, now(), 100, 'comprovante')`,
      [`msg:${crypto.randomUUID()}`],
    );
    expect(r.rowCount).toBe(1);
  });

  test("eventos_automacao aceita entidade 'comprovante' sem lead", async () => {
    const r = await getPoolMotor().query(
      `insert into wakeclub.eventos_automacao
         (agente, tipo_evento, entidade_tipo, entidade_id, lead_id, origem_tipo, correlacao_id)
       values ('sistema', 'comprovante_lido', 'comprovante', gen_random_uuid(), null, 'motor', $1::text)`,
      [`t:${crypto.randomUUID()}`],
    );
    expect(r.rowCount).toBe(1);
  });

  test("venda_pix existe em configuracoes com chave, cnpj e preços nulos", async () => {
    const { rows } = await getPoolMotor().query<{ valor: unknown }>(
      "select valor from wakeclub.configuracoes where chave = 'venda_pix'",
    );
    expect(rows[0].valor).toEqual({
      chave: null,
      cnpj: null,
      precos: { "1": null, "2": null, "4": null },
    });
  });

  test("reaplicar o arquivo não falha nem sobrescreve venda_pix (transação revertida)", () => {
    // A role do motor não alcança DDL, por isso o node à parte com o dono do banco.
    const r = spawnSync(
      "node",
      [
        "--input-type=module",
        "-e",
        `import pg from "pg";
         import { readFileSync } from "node:fs";
         const c = new pg.Client(process.env.ADMIN_DATABASE_URL);
         await c.connect();
         const q = (s) => c.query(s).then((r) => r.rows);
         await q("begin");
         await q("set local search_path to wakeclub, public");
         await q("update configuracoes set valor = jsonb_set(valor, '{cnpj}', '\\"123\\"') where chave = 'venda_pix'");
         const sql = readFileSync("db/migrations/0009_vendas_pix.sql", "utf8");
         await q(sql);
         await q(sql);
         const out = (await q("select valor ->> 'cnpj' as cnpj from configuracoes where chave = 'venda_pix'"))[0];
         await q("rollback");
         await c.end();
         console.log(JSON.stringify(out));`,
      ],
      { encoding: "utf8" },
    );
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout)).toEqual({ cnpj: "123" });
  });
});
