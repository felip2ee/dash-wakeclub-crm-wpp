/**
 * Inscrição autenticada dos aparelhos da equipe em Web Push.
 *
 * O painel grava apenas a assinatura do navegador; a fila de notificações
 * continua pertencendo integralmente ao n8n.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirSessao } from "./auth";
import { getPoolRw } from "./db";

const inscricaoSchema = z.object({
  endpoint: z.string().url().max(2_000),
  p256dh: z.string().min(1).max(1_000),
  auth: z.string().min(1).max(1_000),
  apelido: z.string().trim().min(1).max(100),
});

export const getChavePublicaPush = createServerFn({ method: "GET" }).handler(async () => {
  const chave = process.env.VITE_VAPID_PUBLIC_KEY;
  if (!chave) throw new Error("A chave pública de notificações não foi configurada.");
  return chave;
});

export const salvarInscricao = createServerFn({ method: "POST" })
  .validator(inscricaoSchema)
  .handler(async ({ data }): Promise<{ salvo: true }> => {
    const sessao = await exigirSessao();
    await getPoolRw().query(
      `insert into wakeclub.push_subscriptions
         (usuario_id, endpoint, p256dh, auth, apelido, falhas, ultimo_erro)
       values ($1::uuid, $2::text, $3::text, $4::text, $5::text, 0, null)
       on conflict (endpoint) do update
         set usuario_id = excluded.usuario_id,
             p256dh = excluded.p256dh,
             auth = excluded.auth,
             apelido = excluded.apelido,
             falhas = 0,
             ultimo_erro = null`,
      [sessao.usuarioId, data.endpoint, data.p256dh, data.auth, data.apelido],
    );
    return { salvo: true };
  });

export const testarMinhaNotificacao = createServerFn({ method: "POST" }).handler(async () => {
  const sessao = await exigirSessao();
  const { entregarPush } = await import("./push-dispatch");
  return entregarPush({
    usuarioId: sessao.usuarioId,
    titulo: "Notificações ativadas",
    corpo: `Tudo certo, ${sessao.nome}. Este aparelho está pronto para receber avisos.`,
    url: "/followups",
    tag: `teste-${sessao.usuarioId}`,
  });
});
