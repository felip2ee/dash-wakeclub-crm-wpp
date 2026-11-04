import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// Banco descartável dentro do mesmo Postgres: o do teste já está migrado até a última.
// O driver `pg` só pode ser importado por src/server/db.ts, então o SQL roda num node -e
// (mesmo truque de src/server/motor/migracoes.db.test.ts).
function sql(url: string, comando: string): string {
  const r = spawnSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `import pg from "pg";
       const c = new pg.Client(process.argv[1]);
       await c.connect();
       const { rows } = await c.query(process.argv[2]);
       console.log(JSON.stringify(rows));
       await c.end();`,
      url,
      comando,
    ],
    { encoding: "utf8" },
  );
  expect(r.stderr).toBe("");
  return r.stdout;
}

describe.skipIf(process.env.TESTE_BANCO !== "1")("migrar --pendentes", () => {
  test("lista só as não aplicadas e não altera migracoes", () => {
    const admin = new URL(process.env.ADMIN_DATABASE_URL ?? "");
    const nome = `mig_teste_${randomBytes(4).toString("hex")}`;
    const urlDe = (banco: string) => {
      const u = new URL(admin);
      u.pathname = `/${banco}`;
      return u.toString();
    };
    const migrar = (...args: string[]) =>
      spawnSync("node", ["scripts/migrar.mjs", ...args], {
        encoding: "utf8",
        env: { ...process.env, ADMIN_DATABASE_URL: urlDe(nome) },
      });
    const lerMigracoes = () =>
      sql(urlDe(nome), "select nome from wakeclub.migracoes order by nome");

    sql(urlDe("postgres"), `create database ${nome}`);
    try {
      expect(migrar("--ate", "0001").status).toBe(0);
      // Stub de v_followups_fila, que só existe em produção (ver scripts/banco-teste.sh).
      sql(
        urlDe(nome),
        `create view wakeclub.v_followups_fila as
         select f.id as followup_id, l.atendente_id
           from wakeclub.followups f join wakeclub.leads l on l.id = f.lead_id`,
      );
      expect(migrar("--ate", "0002").status).toBe(0);
      const antes = lerMigracoes();

      const r = migrar("--pendentes");
      expect(r.stderr).toBe("");
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split("\n")).toEqual([
        "0003_virada.sql",
        "0004_ia_followup.sql",
        "0005_vendas.sql",
      ]);
      expect(lerMigracoes()).toBe(antes);
    } finally {
      sql(urlDe("postgres"), `drop database ${nome} with (force)`);
    }
  });
});
