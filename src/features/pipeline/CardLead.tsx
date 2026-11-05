import { Clock, UserRound } from "lucide-react";

import { ChipTemperatura } from "@/components/ui/chip-temperatura";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { OpportunityWorkspace } from "@/features/opportunities/OpportunityWorkspace";
import { dataHora, moeda } from "@/lib/formato";
import type { LeadPipeline } from "@/server/leads";

// Card do Pipeline (referência 04): nome, temperatura, dono, horas e valor cheio.
// O clique abre o mesmo OpportunityWorkspace do kanban; nada de arrastar.
export function CardLead({ lead }: { lead: LeadPipeline }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="w-full rounded-xl border border-border bg-background/60 p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate font-semibold leading-tight">
              {lead.nome ?? "Sem nome"}
            </span>
            <ChipTemperatura temperatura={lead.temperatura} className="shrink-0" />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserRound aria-hidden className="h-4 w-4 shrink-0" />
            <span className="truncate">{lead.atendenteNome ?? "Sem dono"}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock aria-hidden className="h-4 w-4 shrink-0" />
              {/* Sem estimativa da IA o valor conta 1 h (valorCheio); mostra o mesmo. */}
              <span title={lead.horasEstimadas === null ? "Sem estimativa da IA" : undefined}>
                ~ {lead.horasEstimadas ?? 1} h
              </span>
            </span>
            <span className="font-semibold tabular-nums">{moeda(lead.valorCheio)}</span>
          </div>
          {(lead.etiqueta === "Aluno com horas" || lead.etiqueta === "Aluno sem horas") && (
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              <p>
                {lead.saldoHoras === null ? "saldo desconhecido" : `${lead.saldoHoras} h restantes`}
              </p>
              {lead.proximaAulaEm && <p>próxima aula {dataHora(lead.proximaAulaEm)}</p>}
              {lead.ultimaAulaEm && <p>última aula {dataHora(lead.ultimaAulaEm)}</p>}
            </div>
          )}
        </button>
      </DialogTrigger>
      <OpportunityWorkspace lead={lead} />
    </Dialog>
  );
}
