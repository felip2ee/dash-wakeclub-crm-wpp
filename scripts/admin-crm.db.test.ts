/** Testes de banco do scripts/admin-crm.mjs (rodam com `bun run test:db`). */
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
// O teste usa a role dona do banco (ADMIN_DATABASE_URL), que src/server/db.ts não expõe.
// eslint-disable-next-line no-restricted-imports
import pg from "pg";

// @ts-expect-error script .mjs sem declaração de tipos
import { definirAdmin, listarAdmins } from "./admin-crm.mjs";

describe.skipIf(process.env.TESTE_BANCO !== "1")("admin-crm", () => {
  const db = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
  const usuario = `adm${randomUUID().slice(0, 10)}`;

  beforeAll(() => db.connect());
  afterAll(() => db.end());

  const hashAtual = async () =>
    (await db.query("select senha_hash from wakeclub.usuarios where usuario = $1::text", [usuario]))
      .rows;

  test("cria, lista e troca a senha", async () => {
    expect(await definirAdmin(db, { nome: "Admin Teste", usuario, senha: "senha-um-123" })).toBe(
      "criado",
    );
    const lista: { usuario: string }[] = await listarAdmins(db);
    expect(lista.some((a) => a.usuario === usuario)).toBe(true);
    expect(await bcrypt.compare("senha-um-123", (await hashAtual())[0].senha_hash)).toBe(true);

    expect(await definirAdmin(db, { nome: "Admin Teste", usuario, senha: "senha-dois-456" })).toBe(
      "atualizado",
    );
    const linhas = await hashAtual();
    expect(linhas).toHaveLength(1);
    expect(await bcrypt.compare("senha-um-123", linhas[0].senha_hash)).toBe(false);
    expect(await bcrypt.compare("senha-dois-456", linhas[0].senha_hash)).toBe(true);
  });

  test("rejeita senha curta e usuário fora da regra", async () => {
    await expect(definirAdmin(db, { nome: "X", usuario, senha: "curta" })).rejects.toThrow();
    await expect(
      definirAdmin(db, { nome: "X", usuario: "Com Espaço", senha: "senha-longa-1" }),
    ).rejects.toThrow();
  });
});
