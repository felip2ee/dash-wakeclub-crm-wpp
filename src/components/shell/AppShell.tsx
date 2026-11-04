import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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

// Esqueleto das telas novas enquanto o conteúdo não chega: título da referência
// e atalhos para as telas antigas que ainda fazem o trabalho.
export function TelaEmBreve({
  titulo,
  subtitulo,
  aviso,
  atalhos,
}: {
  titulo: string;
  subtitulo: string;
  aviso: string;
  atalhos: { url: string; texto: string }[];
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <header>
        <h1 className="font-display text-3xl font-bold">{titulo}</h1>
        <p className="text-muted-foreground">{subtitulo}</p>
      </header>
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{aviso}</p>
        <ul className="flex flex-wrap gap-2">
          {atalhos.map((a) => (
            <li key={a.url}>
              <Link
                to={a.url}
                className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {a.texto}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
