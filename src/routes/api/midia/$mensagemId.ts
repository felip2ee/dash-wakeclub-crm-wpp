/** Bytes de uma mídia da conversa, buscados na Evolution (ver `src/server/midia.ts`). */
import { createFileRoute } from "@tanstack/react-router";

import { responderMidia } from "@/server/midia";

export const Route = createFileRoute("/api/midia/$mensagemId")({
  server: {
    handlers: {
      GET: ({ params }) => responderMidia(params.mensagemId),
    },
  },
});
