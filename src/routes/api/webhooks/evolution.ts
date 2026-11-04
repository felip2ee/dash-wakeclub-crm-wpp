/** Webhook do Evolution Go: grava o corpo bruto na fila do motor. */
import { createFileRoute } from "@tanstack/react-router";

import { receberWebhook } from "@/server/webhooks/receber";

export const Route = createFileRoute("/api/webhooks/evolution")({
  server: {
    handlers: {
      POST: ({ request }) => receberWebhook("evolution", request),
    },
  },
});
