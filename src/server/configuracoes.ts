/**
 * Configurações gerais que o admin edita em /configuracoes. Por enquanto só o preço
 * da hora (`configuracoes.preco_hora`, jsonb numérico), base do valor esperado dos
 * leads. Grava pela painel_rw (grant select/update da migração 0004); a linha já
 * nasce na migração, então aqui não há insert. O SQL fica em helpers que recebem o
 * cliente, para testar sem cookie.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { type ClienteDb, getPoolRw } from "./db";

export type Configuracoes = { precoHora: number };

export async function lerConfiguracoes(db: ClienteDb): Promise<Configuracoes> {
  const { rows } = await db.query<{ preco_hora: string | null }>(
    `select valor #>> '{}' as preco_hora
       from wakeclub.configuracoes where chave = 'preco_hora'`,
  );
  return { precoHora: Number(rows[0]?.preco_hora ?? 0) };
}

export async function gravarPrecoHora(db: ClienteDb, valor: number): Promise<void> {
  const { rowCount } = await db.query(
    `update wakeclub.configuracoes
        set valor = to_jsonb($1::numeric)
      where chave = 'preco_hora'`,
    [valor],
  );
  if (rowCount !== 1) throw new Error("Configuração do preço da hora não encontrada.");
}

export const getConfiguracoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Configuracoes> => {
    await exigirAdmin();
    return lerConfiguracoes(getPoolRw());
  },
);

export const definirPrecoHora = createServerFn({ method: "POST" })
  .validator(
    z.object({
      valor: z
        .number()
        // 0,01: depois do arredondamento para centavos ainda é maior que zero.
        .min(0.01, "O preço da hora precisa ser maior que zero.")
        .max(100_000, "Preço da hora acima do esperado."),
    }),
  )
  .handler(async ({ data }): Promise<Configuracoes> => {
    await exigirAdmin();
    // Centavos: o campo aceita vírgula, mas o banco guarda no máximo duas casas.
    const valor = Math.round(data.valor * 100) / 100;
    await gravarPrecoHora(getPoolRw(), valor);
    return { precoHora: valor };
  });
