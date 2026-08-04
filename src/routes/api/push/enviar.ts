/** Endpoint server-only chamado pelo WF-09 para entregar notificações Web Push. */
import { createHash, timingSafeEqual } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { entregarPush } from "@/server/push-dispatch";

const payloadSchema = z.object({
  usuarioId: z.string().uuid().nullable(),
  titulo: z.string().trim().min(1).max(120),
  corpo: z.string().max(500).optional(),
  url: z.string().startsWith("/").max(500).optional(),
  tag: z.string().max(200).optional(),
});

export const Route = createFileRoute("/api/push/enviar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!segredoValido(request.headers.get("x-push-secret"))) {
          return Response.json({ erro: "Não encontrado" }, { status: 404 });
        }

        let entrada: unknown;
        try {
          entrada = await request.json();
        } catch {
          return Response.json({ erro: "JSON inválido" }, { status: 400 });
        }

        const validacao = payloadSchema.safeParse(entrada);
        if (!validacao.success) {
          return Response.json({ erro: "Payload inválido" }, { status: 400 });
        }

        return Response.json(await entregarPush(validacao.data));
      },
    },
  },
});

function segredoValido(recebido: string | null) {
  const esperado = process.env.PUSH_DISPATCH_SECRET;
  if (!recebido || !esperado) return false;

  const hashRecebido = createHash("sha256").update(recebido).digest();
  const hashEsperado = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(hashRecebido, hashEsperado);
}
