import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronRight, MessageCircle, TrendingUp, Trophy, Zap } from "lucide-react";
import type { ReactNode } from "react";

import { rotaInicial } from "@/components/shell/navegacao";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { CardDegrade } from "@/components/ui/card-degrade";
import { ChipTemperatura } from "@/components/ui/chip-temperatura";
import { Skeleton } from "@/components/ui/skeleton";
import { dinheiroDisponivel } from "@/features/dinheiro/disponivel";
import { desde, telefone } from "@/lib/formato";
import { exigirSessao } from "@/server/auth";
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Meu painel</h1>
        <p className="text-muted-foreground">Visão geral de performance e comissões</p>
      </header>

      {/* O valor esperado e a comissão entram nas Tasks 6/7 e na fase 4, no lugar deste "em breve". */}
      {!dinheiroDisponivel && (
        <CardDegrade
          titulo="Pode entrar"
          valor="Em breve"
          legenda="Comissões aparecem aqui quando as vendas chegarem ao CRM"
          icone={TrendingUp}
        />
      )}

      <section aria-labelledby="acoes-rapidas" className="space-y-3">
        <h2 id="acoes-rapidas" className="text-lg font-semibold">
          Ações rápidas
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {/* shortcut: contagem de follow-ups mostra "—" até existir listarFilaAprovacao (src/server/aprovacao.ts). */}
          <AcaoRapida to="/aprovar" icone={<Zap aria-hidden className="h-6 w-6 text-primary" />}>
            <span className="block font-semibold">Follow-ups</span>
            <span className="block text-sm text-muted-foreground">— pendentes</span>
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

      <section
        aria-labelledby="ranking"
        className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
      >
        <Trophy aria-hidden className="h-6 w-6 shrink-0 text-muted-foreground" />
        <div>
          <h2 id="ranking" className="font-semibold">
            Ranking da semana
          </h2>
          <p className="text-sm text-muted-foreground">Em breve</p>
        </div>
      </section>
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
