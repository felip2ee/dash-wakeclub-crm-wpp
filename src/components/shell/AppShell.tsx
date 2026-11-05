import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { listarFilaAprovacao } from "@/server/aprovacao";
import type { Sessao } from "@/server/auth";
import { listarMeusLeads } from "@/server/meus-leads";
import { BarraInferior } from "./BarraInferior";
import { BarraLateral } from "./BarraLateral";
import { cn } from "@/lib/utils";
import {
  abasCelularAdmin,
  abasCelularAtendente,
  conversaAberta,
  itensDesktopAdmin,
} from "./navegacao";

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
  // Com a conversa aberta, o celular fica em tela cheia (só o cabeçalho da própria conversa).
  const telaCheia = useRouterState({
    select: (s) => conversaAberta(s.location.pathname, s.location.search),
  });
  // Mesmas chaves de /inicio e /aprovar: a contagem sai do cache quando a tela já carregou.
  // shortcut: sem badges do admin; entram se o admin pedir contagem na navegação.
  const { data: meusLeads } = useQuery({
    queryKey: ["meus-leads"],
    queryFn: () => listarMeusLeads(),
    enabled: !admin,
  });
  const { data: filaAprovacao } = useQuery({
    queryKey: ["aprovacao", null],
    queryFn: () => listarFilaAprovacao({ data: {} }),
    enabled: !admin,
  });
  const contagens: Record<string, number> = {
    "/meus-leads": meusLeads?.filter((l) => l.aguardandoEquipe).length ?? 0,
    "/aprovar": filaAprovacao?.length ?? 0,
  };

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <BarraLateral
        sessao={sessao}
        itens={admin ? itensDesktopAdmin : abasCelularAtendente}
        contagens={contagens}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* viewport-fit=cover: no iPhone instalado o cabeçalho desce abaixo da barra de status. */}
        <header
          className={cn(
            "sticky top-0 z-20 flex h-(--cabecalho) items-center gap-3 border-b border-border bg-background/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur",
            telaCheia && "max-md:hidden",
          )}
        >
          {cabecalho}
        </header>
        {/* Espaço da barra inferior flutuante no celular (--barra-inferior em styles.css). */}
        <main className={cn("min-h-0 flex-1 md:pb-0", !telaCheia && "pb-(--barra-inferior)")}>
          {children}
        </main>
      </div>
      {!telaCheia && (
        <BarraInferior
          itens={admin ? abasCelularAdmin : abasCelularAtendente}
          contagens={contagens}
        />
      )}
    </div>
  );
}
