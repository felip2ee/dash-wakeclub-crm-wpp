import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronRight, MessageCircle, Zap } from "lucide-react";
import type { ReactNode } from "react";

import { rotaInicial } from "@/components/shell/navegacao";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { ChipTemperatura } from "@/components/ui/chip-temperatura";
import { Skeleton } from "@/components/ui/skeleton";
import { PainelVendedor } from "@/features/dinheiro/PainelVendedor";
import { RankingSemanal } from "@/features/dinheiro/RankingSemanal";
import { desde, plural, telefone } from "@/lib/formato";
import { listarFilaAprovacao } from "@/server/aprovacao";
import { exigirSessao } from "@/server/auth";
import { getPainelVendedor } from "@/server/dinheiro";
import { listarMeusLeads } from "@/server/meus-leads";

export const Route = createFileRoute("/inicio")({
  beforeLoad: async () => {
    const sessao = await exigirSessao();
    if (sessao.papel !== "atendente") throw redirect({ to: rotaInicial(sessao.papel) });
    return { sessao };
  },
  head: () => ({ meta: [{ title: "Meu painel — Wake Club" }] }),
  component: InicioPage,
});

// "Meu painel" do atendente (referência 05).
function InicioPage() {
  const {
    data: leads,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["meus-leads"],
    queryFn: () => listarMeusLeads(),
  });
  const esperando = leads?.filter((l) => l.aguardandoEquipe) ?? [];
  const painel = useQuery({
    queryKey: ["painel-vendedor"],
    queryFn: () => getPainelVendedor(),
  });
  // Mesma chave de /aprovar e da barra: atendente vê só a própria fila.
  const fila = useQuery({
    queryKey: ["aprovacao", null],
    queryFn: () => listarFilaAprovacao({ data: {} }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Meu painel</h1>
        <p className="text-muted-foreground">Visão geral de performance e comissões</p>
      </header>

      {painel.isError ? (
        <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
          Não foi possível carregar suas comissões.{" "}
          <button
            type="button"
            onClick={() => void painel.refetch()}
            className="min-h-11 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <PainelVendedor painel={painel.data} />
      )}

      <section aria-labelledby="acoes-rapidas" className="space-y-3">
        <h2 id="acoes-rapidas" className="text-lg font-semibold">
          Ações rápidas
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <AcaoRapida to="/aprovar" icone={<Zap aria-hidden className="h-6 w-6 text-primary" />}>
            <span className="block font-semibold">Follow-ups</span>
            <span className="block text-sm text-muted-foreground">
              {fila.isPending
                ? "…"
                : fila.isError
                  ? "—"
                  : plural(fila.data.length, "pendente", "pendentes")}
            </span>
          </AcaoRapida>
          <AcaoRapida
            to="/meus-leads"
            icone={<MessageCircle aria-hidden className="h-6 w-6 text-primary" />}
          >
            <span className="block font-semibold">Conversas</span>
            <span className="block text-sm text-muted-foreground">
              {isPending ? "…" : isError ? "—" : `${esperando.length} esperando`}
            </span>
          </AcaoRapida>
        </div>
      </section>

      <section aria-labelledby="esperando" className="space-y-3">
        <h2 id="esperando" className="text-lg font-semibold">
          Esperando resposta
        </h2>
        {isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Carregando leads">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : isError ? (
          <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
            Não foi possível carregar seus leads.{" "}
            <button
              type="button"
              onClick={() => void refetch()}
              className="min-h-11 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Tentar novamente
            </button>
          </div>
        ) : esperando.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Nenhum lead esperando sua resposta.
          </p>
        ) : (
          <ul className="space-y-2">
            {esperando.map((lead) => (
              <li key={lead.id}>
                <Link
                  to="/meus-leads"
                  search={{ lead: lead.id }}
                  className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <AvatarIniciais nome={lead.nome ?? telefone(lead.telefone)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">
                        {lead.nome ?? telefone(lead.telefone)}
                      </span>
                      <ChipTemperatura temperatura={lead.temperatura} />
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {lead.etiqueta} · {desde(lead.ultimaMsgEm)}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {painel.data && <RankingSemanal ranking={painel.data.rankingSemanal} />}
    </div>
  );
}

function AcaoRapida({
  to,
  icone,
  children,
}: {
  // string: /aprovar só entra na árvore de rotas com a Task 3.
  to: string;
  icone: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {icone}
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
