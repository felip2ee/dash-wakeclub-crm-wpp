import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { Sessao } from "@/server/auth";
import { listarMeusLeads } from "@/server/meus-leads";
import { BarraInferior } from "./BarraInferior";
import { BarraLateral } from "./BarraLateral";
import { abasCelularAdmin, abasCelularAtendente, itensDesktopAdmin } from "./navegacao";

// Moldura das telas logadas: barra lateral no desktop, barra inferior no celular.
export function AppShell({
  sessao,
  cabecalho,
  children,
}: {
  sessao: Sessao;
  cabecalho: ReactNode;
  children: ReactNode;
}) {
  const admin = sessao.papel === "admin";
  // Mesma chave de /inicio: a contagem sai do cache quando a tela já carregou.
  // shortcut: sem contagem de follow-ups nem badges do admin até existir server de aprovação (Task 3).
  const { data: meusLeads } = useQuery({
    queryKey: ["meus-leads"],
    queryFn: () => listarMeusLeads(),
    enabled: !admin,
  });
  const contagens: Record<string, number> = {
    "/meus-leads": meusLeads?.filter((l) => l.aguardandoEquipe).length ?? 0,
  };

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <BarraLateral
        sessao={sessao}
        itens={admin ? itensDesktopAdmin : abasCelularAtendente}
        contagens={contagens}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          {cabecalho}
        </header>
        {/* pb-20: espaço da barra inferior no celular. */}
        <main className="min-h-0 flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <BarraInferior
        itens={admin ? abasCelularAdmin : abasCelularAtendente}
        contagens={contagens}
      />
    </div>
  );
}
