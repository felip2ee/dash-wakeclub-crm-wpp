/**
 * Configurações gerais que o admin vê em /configuracoes: o preço da hora
 * (`configuracoes.preco_hora`, jsonb numérico), a meta de vendas por dia (`meta_vendas_dia`), base do valor esperado dos leads, e os
 * endereços dos webhooks com os segredos, para colar na Evolution e no sistema de vendas.
 * O preço grava pela painel_rw (grant select/update da migração 0004); a linha já
 * nasce na migração, então aqui não há insert. O SQL fica em helpers que recebem o
 * cliente, para testar sem cookie.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { type ClienteDb, getPoolRw } from "./db";

export type Configuracoes = { precoHora: number; metaVendasDia: number };

export async function lerConfiguracoes(db: ClienteDb): Promise<Configuracoes> {
  const { rows } = await db.query<{ chave: string; valor: string | null }>(
    `select chave, valor #>> '{}' as valor
       from wakeclub.configuracoes where chave in ('preco_hora', 'meta_vendas_dia')`,
  );
  const valor = (chave: string) => Number(rows.find((r) => r.chave === chave)?.valor ?? 0);
  return { precoHora: valor("preco_hora"), metaVendasDia: valor("meta_vendas_dia") };
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

export async function gravarMetaVendasDia(db: ClienteDb, valor: number): Promise<void> {
  const { rowCount } = await db.query(
    `update wakeclub.configuracoes
        set valor = to_jsonb($1::int)
      where chave = 'meta_vendas_dia'`,
    [valor],
  );
  if (rowCount !== 1) throw new Error("Configuração da meta de vendas não encontrada.");
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
    return lerConfiguracoes(getPoolRw());
  });

export const definirMetaVendasDia = createServerFn({ method: "POST" })
  .validator(
    z.object({
      valor: z
        .number()
        .int()
        .min(1, "A meta precisa ser de pelo menos 1 venda por dia.")
        .max(1000, "Meta acima do esperado."),
    }),
  )
  .handler(async ({ data }): Promise<Configuracoes> => {
    await exigirAdmin();
    await gravarMetaVendasDia(getPoolRw(), data.valor);
    return lerConfiguracoes(getPoolRw());
  });

export type WebhookDestino = {
  url: string;
  /** `null` quando a variável de ambiente do segredo não está definida no servidor. */
  segredo: string | null;
  urlComToken: string | null;
};

export type Webhooks = { evolution: WebhookDestino; vendas: WebhookDestino };

/** Monta a URL pública do webhook; o token na query é a alternativa ao header. */
export function montarWebhook(
  origem: string,
  caminho: string,
  segredo: string | undefined,
): WebhookDestino {
  const url = new URL(caminho, origem).toString();
  if (!segredo) return { url, segredo: null, urlComToken: null };
  const comToken = new URL(url);
  comToken.searchParams.set("token", segredo);
  return { url, segredo, urlComToken: comToken.toString() };
}

// Só admin: a resposta leva os segredos dos webhooks (decisão do dono, 04/11/2026).
export const getWebhooks = createServerFn({ method: "GET" }).handler(
  async (): Promise<Webhooks> => {
    await exigirAdmin();
    // Atrás do Traefik, host e protocolo públicos vêm dos cabeçalhos X-Forwarded-*.
    const { origin } = getRequestUrl({ xForwardedHost: true, xForwardedProto: true });
    return {
      evolution: montarWebhook(
        origin,
        "/api/webhooks/evolution",
        process.env.WEBHOOK_EVOLUTION_SECRET,
      ),
      vendas: montarWebhook(origin, "/api/webhooks/vendas", process.env.WEBHOOK_VENDAS_SECRET),
    };
  },
);
