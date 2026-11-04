import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

import { getPoolMotor } from "../db";
import { bancoTesteAtivo } from "./banco-teste";

describe.skipIf(!bancoTesteAtivo)("migrações", () => {
  test("aplica duas vezes sem erro", () => {
    for (let i = 0; i < 2; i++) {
      const r = spawnSync("node", ["scripts/migrar.mjs"], { encoding: "utf8" });
      expect(r.stderr).toBe("");
      expect(r.status).toBe(0);
    }
    const ultima = spawnSync("node", ["scripts/migrar.mjs"], { encoding: "utf8" });
    expect(ultima.stdout).toContain("nenhuma migração pendente");
  });

  test("registra exatamente os arquivos de db/migrations", () => {
    // wakeclub.migracoes é só do dono do banco: lê pela mesma ADMIN_DATABASE_URL do migrar.mjs.
    const r = spawnSync(
      "node",
      [
        "--input-type=module",
        "-e",
        `import pg from "pg";
         const c = new pg.Client(process.env.ADMIN_DATABASE_URL);
         await c.connect();
         const { rows } = await c.query("select nome from wakeclub.migracoes order by nome");
         console.log(JSON.stringify(rows.map((r) => r.nome)));
         await c.end();`,
      ],
      { encoding: "utf8" },
    );
    expect(r.stderr).toBe("");
    const arquivos = readdirSync("db/migrations")
      .filter((nome) => nome.endsWith(".sql"))
      .sort();
    expect(JSON.parse(r.stdout)).toEqual(arquivos);
  });

  test("motor nao le senha_hash", async () => {
    const erro = await getPoolMotor()
      .query("select senha_hash from wakeclub.usuarios limit 1")
      .then(() => null)
      .catch((e: { code?: string }) => e);
    expect(erro?.code).toBe("42501");
  });
});
