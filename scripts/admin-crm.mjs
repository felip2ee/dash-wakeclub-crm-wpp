#!/usr/bin/env node
/**
 * WakeCRM · lista e define o administrador do CRM.
 *
 *   bun scripts/admin-crm.mjs listar     uma linha `<usuario>\t<nome>` por admin ativo
 *   bun scripts/admin-crm.mjs definir    cria ou atualiza o admin (imprime `criado` ou `atualizado`)
 *
 * Por que existe: o instalador de produção precisa criar o primeiro admin (e redefinir a
 * senha dele) sem passar pela tela. Segredos vêm só do ambiente, nunca de argumento, e
 * a senha e o hash nunca são impressos.
 *
 * Lê do ambiente (ou do .env, o ambiente ganha):
 *   ADMIN_DATABASE_URL                       dono do banco.
 *   ADMIN_NOME, ADMIN_USUARIO, ADMIN_SENHA   só para `definir`.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

/** Admins ativos, por usuário. */
export async function listarAdmins(db) {
  const { rows } = await db.query(
    `select usuario, nome from wakeclub.usuarios
      where papel = 'admin' and ativo order by usuario`,
  );
  return rows.map((r) => ({ usuario: r.usuario, nome: r.nome }));
}

/** Cria o admin ou, se o usuário já existe, redefine senha e o torna admin ativo. */
export async function definirAdmin(db, { nome, usuario, senha }) {
  // Mesma regra do CHECK da tabela, para falhar antes de tocar no banco.
  if (!nome?.trim()) throw new Error("O nome do admin não pode ser vazio.");
  if (!/^\S{3,}$/.test(usuario ?? "") || usuario !== usuario.toLowerCase())
    throw new Error("O usuário precisa ter 3 ou mais caracteres, em minúsculas e sem espaços.");
  if ((senha ?? "").length < 8) throw new Error("A senha precisa ter 8 ou mais caracteres.");

  const { default: bcrypt } = await import("bcryptjs");
  const hash = await bcrypt.hash(senha, 12);
  const { rows } = await db.query(
    `insert into wakeclub.usuarios (nome, usuario, senha_hash, papel, ativo)
     values ($1::text, $2::text, $3::text, 'admin', true)
     on conflict (usuario) do update
       set nome = excluded.nome, senha_hash = excluded.senha_hash,
           papel = 'admin', ativo = true, atualizado_em = now()
     returning (xmax = 0) as criado`,
    [nome.trim(), usuario, hash],
  );
  return rows[0].criado ? "criado" : "atualizado";
}

async function main() {
  carregarEnv();
  const comando = process.argv[2];
  if (comando !== "listar" && comando !== "definir") {
    console.error("uso: admin-crm.mjs listar|definir");
    process.exit(1);
  }
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    console.error("ADMIN_DATABASE_URL não está definida.");
    process.exit(1);
  }
  const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  await db.connect();
  try {
    if (comando === "listar") {
      for (const a of await listarAdmins(db)) console.log(`${a.usuario}\t${a.nome}`);
    } else {
      console.log(
        await definirAdmin(db, {
          nome: process.env.ADMIN_NOME,
          usuario: process.env.ADMIN_USUARIO,
          senha: process.env.ADMIN_SENHA,
        }),
      );
    }
  } finally {
    await db.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((erro) => {
    console.error(`admin-crm: ${erro.message}`);
    process.exit(1);
  });
}
