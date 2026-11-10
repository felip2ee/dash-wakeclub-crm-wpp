import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Voltar a uma tela já vista mostra o que estava em memória e atualiza por trás,
  // em vez de "Carregando…" a cada abertura. Só memória: nada fica no aparelho.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 30 * 60_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
