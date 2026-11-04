import { Link } from "@tanstack/react-router";
import {
  Bell,
  CalendarClock,
  ChevronRight,
  Link2,
  type LucideIcon,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { plural } from "@/lib/formato";
import type { AlertasOperacao as Alertas } from "@/server/visao-geral";

type Alerta = {
  titulo: string;
  icone: LucideIcon;
  texto: string;
  acao?: {
    rotulo: string;
    to: "/aprovar" | "/pipeline" | "/configuracoes";
    hash?: string;
    total: number;
  };
};

function montar(a: Alertas): Alerta[] {
  const fila = a.filaFalhas + a.filaAtrasados;
  return [
    {
      titulo: "Aprovações pendentes",
      icone: ThumbsUp,
      texto: `${plural(a.aprovacoesPendentes, "follow-up aguardando", "follow-ups aguardando")} sua aprovação.`,
      acao: { rotulo: "Revisar", to: "/aprovar", total: a.aprovacoesPendentes },
    },
    { titulo: "Vendas não conciliadas", icone: Link2, texto: "Ainda sem vendas pelo webhook." },
    {
      titulo: "Follow-ups em atraso",
      icone: CalendarClock,
      texto: `${plural(a.followupsEmAtraso, "lead", "leads")} com follow-up vencido há mais de 2 dias.`,
      acao: { rotulo: "Revisar", to: "/pipeline", total: a.followupsEmAtraso },
    },
    {
      titulo: "Fila de eventos",
      icone: TriangleAlert,
      texto: `${plural(a.filaFalhas, "falha", "falhas")} e ${plural(a.filaAtrasados, "evento atrasado", "eventos atrasados")}.`,
      acao: { rotulo: "Resolver", to: "/configuracoes", hash: "fila", total: fila },
    },
  ];
}

// "Ações que precisam da sua atenção" (referência 03); o botão some quando não há o que fazer.
export function AlertasOperacao({ alertas }: { alertas: Alertas | undefined }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <Bell aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <h2 className="font-display text-lg font-semibold">Alertas de operações</h2>
          <p className="text-sm text-muted-foreground">Ações que precisam da sua atenção</p>
        </div>
      </header>
      <ul className="mt-3 space-y-2">
        {!alertas &&
          [0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Skeleton className="h-14 rounded-lg" />
            </li>
          ))}
        {alertas &&
          montar(alertas).map(({ titulo, icone: Icone, texto, acao }) => (
            <li
              key={titulo}
              className="flex items-center gap-3 rounded-lg bg-gradiente-primario-suave p-3"
            >
              <Icone aria-hidden className="h-6 w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{titulo}</p>
                <p className="text-xs text-muted-foreground">{texto}</p>
              </div>
              {acao && acao.total > 0 && (
                <Link
                  to={acao.to}
                  hash={acao.hash}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-primary px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {acao.rotulo} {acao.total} <ChevronRight aria-hidden className="h-4 w-4" />
                </Link>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}
