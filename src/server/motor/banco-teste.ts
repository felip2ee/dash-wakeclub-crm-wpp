/**
 * Apoio dos testes de banco (`*.db.test.ts`). Eles só rodam com `TESTE_BANCO=1`,
 * contra o Postgres descartável de `scripts/banco-teste.sh` (`bun run test:db`).
 * Os dados de cada teste são isolados por valores únicos, não por limpeza: a role
 * do motor não tem DELETE nas tabelas do CRM, de propósito.
 */
import { randomUUID } from "node:crypto";

import { getPoolRw } from "../db";

export const bancoTesteAtivo = process.env.TESTE_BANCO === "1";

/** Telefone E.164 único por chamada (DDD 63, celular). */
export function telefoneUnico(): string {
  return "+55639" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
}

/** Cria um vendedor ativo pela painel_rw, como o admin faz. */
export async function criarVendedor(nome: string, peso = 1): Promise<string> {
  const usuario = `t${randomUUID().slice(0, 12)}`;
  const { rows } = await getPoolRw().query<{ id: string }>(
    `insert into wakeclub.usuarios (nome, usuario, senha_hash, peso)
     values ($1::text, $2::text, 'x', $3::smallint)
     returning id`,
    [nome, usuario, peso],
  );
  return rows[0].id;
}

/** Desliga todos os vendedores, para o teste controlar quem está na distribuição. */
export async function desativarTodos(): Promise<void> {
  await getPoolRw().query("update wakeclub.usuarios set ativo = false where ativo = true");
}
