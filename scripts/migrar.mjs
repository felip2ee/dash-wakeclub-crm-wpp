#!/usr/bin/env node
/**
 * WakeCRM · aplica as migrações de db/migrations/ em ordem.
 *
 *   bun run db:migrate                 aplica todas as pendentes
 *   bun run db:migrate -- --ate 0002   para depois da 0002 (a 0003 é o corte na virada)
 *   bun scripts/migrar.mjs --pendentes lista as pendentes (uma por linha), sem aplicar nem criar nada
 *
 * Por que existe: o schema vivia dentro do workflow n8n "db setup". Agora o app é o dono
 * dele, e cada mudança vira um arquivo versionado, aplicado uma vez e registrado em
 * wakeclub.migracoes. Cada arquivo roda numa transação: ou entra inteiro, ou nada.
 *
 * Lê do ambiente (ou do .env, o ambiente ganha):
 *   ADMIN_DATABASE_URL       dono do banco. A aplicação nunca lê.
 *   WAKECRM_MOTOR_PASSWORD   opcional: cria ou redefine a senha da role wakecrm_motor.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA = resolve(RAIZ, "db", "migrations");

function carregarEnv() {
  let bruto;
  try {
    bruto = readFileSync(resolve(RAIZ, ".env"), "utf8");
  } catch {
    return;
  }
  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    const corte = limpa.indexOf("=");
    if (!limpa || limpa.startsWith("#") || corte === -1) continue;
    const chave = limpa.slice(0, corte).trim();
    const valor = limpa
      .slice(corte + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

function argumentoAte() {
  const i = process.argv.indexOf("--ate");
  if (i === -1) return null;
  const valor = process.argv[i + 1];
  if (!/^\d{4}$/.test(valor ?? "")) {
    console.error("--ate espera um número de 4 dígitos, por exemplo --ate 0002");
    process.exit(1);
  }
  return valor;
}

async function garantirRoleMotor(cliente) {
  const senha = process.env.WAKECRM_MOTOR_PASSWORD;
  if (!senha) return;
  const { rows: existe } = await cliente.query(
    "select 1 from pg_roles where rolname = 'wakecrm_motor'",
  );
  // CREATE/ALTER ROLE não aceita parâmetro; format(%L) faz o escape da senha.
  const { rows } = await cliente.query(
    `select format($f$%s role wakecrm_motor with login password %L$f$,
                   case when $1::boolean then 'alter' else 'create' end, $2::text) as comando`,
    [existe.length > 0, senha],
  );
  await cliente.query(rows[0].comando);
  await cliente.query("grant connect on database wakeclub to wakecrm_motor");
  console.log(
    existe.length > 0 ? "role wakecrm_motor: senha redefinida" : "role wakecrm_motor: criada",
  );
}

async function main() {
  carregarEnv();
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    console.error("ADMIN_DATABASE_URL não está definida.");
    process.exit(1);
  }
  const ate = argumentoAte();
  const arquivos = readdirSync(PASTA)
    .filter((nome) => /^\d{4}_[a-z0-9_]+\.sql$/.test(nome))
    .sort()
    .filter((nome) => ate === null || nome.slice(0, 4) <= ate);

  const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  await cliente.connect();
  try {
    if (process.argv.includes("--pendentes")) {
      // Só leitura: num banco novo a tabela ainda não existe e tudo está pendente.
      const { rows: tabela } = await cliente.query(
        "select to_regclass('wakeclub.migracoes') is not null as existe",
      );
      const { rows } = tabela[0].existe
        ? await cliente.query("select nome from wakeclub.migracoes")
        : { rows: [] };
      const feitas = new Set(rows.map((r) => r.nome));
      for (const nome of arquivos) if (!feitas.has(nome)) console.log(nome);
      return;
    }
    await cliente.query("create schema if not exists wakeclub");
    await cliente.query(
      `create table if not exists wakeclub.migracoes (
         nome text primary key,
         aplicada_em timestamptz not null default now()
       )`,
    );
    await garantirRoleMotor(cliente);

    const { rows } = await cliente.query("select nome from wakeclub.migracoes");
    const aplicadas = new Set(rows.map((r) => r.nome));
    const pendentes = arquivos.filter((nome) => !aplicadas.has(nome));
    if (pendentes.length === 0) {
      console.log("nenhuma migração pendente");
      return;
    }

    for (const nome of pendentes) {
      const sql = readFileSync(resolve(PASTA, nome), "utf8");
      await cliente.query("begin");
      try {
        await cliente.query("set local search_path to wakeclub, public");
        await cliente.query(sql);
        await cliente.query("insert into wakeclub.migracoes (nome) values ($1::text)", [nome]);
        await cliente.query("commit");
        console.log(`aplicada: ${nome}`);
      } catch (erro) {
        await cliente.query("rollback");
        console.error(`falhou: ${nome}: ${erro.message}`);
        process.exitCode = 1;
        return;
      }
    }
  } finally {
    await cliente.end();
  }
}

await main();
