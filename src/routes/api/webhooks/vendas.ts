/** Webhook do sistema de vendas: grava o corpo bruto na fila do motor. */
import { createFileRoute } from "@tanstack/react-router";

import { receberWebhook } from "@/server/webhooks/receber";

export const Route = createFileRoute("/api/webhooks/vendas")({
  server: {
    handlers: {
      POST: ({ request }) => receberWebhook("vendas", request),
    },
  },
});
