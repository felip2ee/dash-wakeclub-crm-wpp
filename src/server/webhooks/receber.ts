/**
 * Entrada dos webhooks externos (Evolution Go e sistema de vendas).
 *
 * Só autentica e grava o corpo bruto em `webhook_eventos`; o motor processa depois.
 * Assim um pico de eventos nunca perde mensagem por timeout de processamento
 * (design §4.1). Segredo inválido ou ausente responde 404 para não revelar a rota.
 * Corpo acima de 25 MB responde 413, mas nada some: fica uma linha `falhou` com o
 * tamanho (sem o corpo), visível no monitor do admin.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { chaveDeOrdemEvolution } from "../evolution";
import { type ClienteDb, getPoolWebhook } from "../db";

type Origem = "evolution" | "vendas";

const LIMITE_BYTES = 25 * 1024 * 1024;

const SEGREDO: Record<Origem, string> = {
  evolution: "WEBHOOK_EVOLUTION_SECRET",
  vendas: "WEBHOOK_VENDAS_SECRET",
};

const naoEncontrado = () => Response.json({ erro: "Não encontrado" }, { status: 404 });

export function segredoConfere(recebido: string | null, esperado: string | undefined): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export async function enfileirar(
  db: ClienteDb,
  origem: Origem,
  corpo: unknown,
  chaveOrdem: string | null,
): Promise<number> {
  const { rows } = await db.query<{ id: string }>(
    `insert into wakeclub.webhook_eventos (origem, corpo, chave_ordem)
     values ($1::text, $2::jsonb, $3::text)
     returning id`,
    // jsonb rejeita o caractere nulo: o insert daria 500 e o evento sumiria sem rastro.
    // Replacer, e não regex no texto, para não comer o literal "\\u0000" escapado.
    [
      origem,
      JSON.stringify(corpo, (_, v: unknown) =>
        typeof v === "string" ? v.replaceAll("\0", "") : v,
      ),
      chaveOrdem,
    ],
  );
  return Number(rows[0].id);
}

async function grandeDemais(origem: Origem, tamanho: number): Promise<Response> {
  const { rows } = await getPoolWebhook().query<{ id: string }>(
    `insert into wakeclub.webhook_eventos (origem, corpo, status, erro)
     values ($1::text, $2::jsonb, 'falhou', 'corpo acima do limite de 25 MB')
     returning id`,
    [origem, JSON.stringify({ descartado: true, tamanho })],
  );
  return Response.json({ erro: "Corpo grande demais", id: Number(rows[0].id) }, { status: 413 });
}

export async function receberWebhook(origem: Origem, request: Request): Promise<Response> {
  // O emissor pode não suportar header próprio; o token na URL é a alternativa.
  const recebido =
    request.headers.get("x-webhook-secret") ?? new URL(request.url).searchParams.get("token");
  if (!segredoConfere(recebido, process.env[SEGREDO[origem]])) return naoEncontrado();

  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_BYTES) return grandeDemais(origem, declarado);
  const bruto = await request.arrayBuffer();
  if (bruto.byteLength > LIMITE_BYTES) return grandeDemais(origem, bruto.byteLength);

  let corpo: unknown;
  try {
    corpo = JSON.parse(new TextDecoder().decode(bruto));
  } catch {
    return Response.json({ erro: "JSON inválido" }, { status: 400 });
  }

  const chave = origem === "evolution" ? chaveDeOrdemEvolution(corpo) : null;
  const id = await enfileirar(getPoolWebhook(), origem, corpo, chave);
  return Response.json({ ok: true, id });
}
