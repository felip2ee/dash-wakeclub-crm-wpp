import { AlarmClock, BellOff, CalendarClock, Clock, Sparkles } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Badge } from "@/components/ui/badge";
import { ChipTemperatura } from "@/components/ui/chip-temperatura";
import { Separator } from "@/components/ui/separator";
import { DonoDoLead } from "@/features/admin/DonoDoLead";
import { dataHora, desde, plural, telefone as fmtTelefone } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Conversa } from "@/server/conversas";

const FOLLOWUP_ROTULO: Record<string, string> = {
  reengajar: "reengajar",
  lembrete_d1: "lembrete D-1",
  lembrete_dia: "lembrete do dia",
  pos_aula: "pós-aula",
  reativacao: "reativação",
};

// Ficha do lead do admin (menu ⋮ da conversa e coluna da direita no desktop largo).
export function DetalhesDoLead({ conversa: c }: { conversa: Conversa }) {
  const atrasado = (c.horasEsperando ?? 0) >= 4;

  return (
    <div className="p-4">
      <div className="flex flex-col items-center pb-4 text-center">
        <AvatarIniciais nome={c.nome ?? fmtTelefone(c.telefone)} tamanho="lg" />
        <h3 className="mt-3 font-display text-base font-semibold">{c.nome ?? "Sem nome"}</h3>
        <p className="text-xs text-muted-foreground">{fmtTelefone(c.telefone)}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {c.etiqueta}
          </Badge>
          <ChipTemperatura temperatura={c.temperatura} />
          {c.optOut && (
            <Badge variant="outline" className="gap-1 rounded-full text-[10px]">
              <BellOff aria-hidden className="h-2.5 w-2.5" /> opt-out
            </Badge>
          )}
        </div>
      </div>

      <Separator className="my-3" />

      {c.aguardandoEquipe && c.horasEsperando !== null && (
        <div
          className={cn(
            "mb-2 rounded-xl border p-3",
            atrasado ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/10",
          )}
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock aria-hidden className="h-3 w-3" /> Aguardando a equipe
          </div>
          <div
            className={cn(
              "mt-0.5 font-display text-xl font-semibold",
              atrasado ? "text-destructive" : "text-warning-foreground",
            )}
          >
            {c.horasEsperando}h
          </div>
        </div>
      )}

      <div className="mb-2">
        <DonoDoLead leadId={c.id} />
      </div>

      <div className="space-y-2 text-sm">
        {/* Tudo daqui pra baixo foi preenchido pela IA (WF-02), não por humano. */}
        <Campo rotulo="Origem" valor={c.origem} />
        <Campo rotulo="Interesse" valor={c.interesse} />
        <Campo rotulo="Objeção" valor={c.objecao} destaque />

        {c.dataAgendada && (
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock aria-hidden className="h-3 w-3" /> Aula agendada
            </div>
            <div className="text-sm font-medium" suppressHydrationWarning>
              {dataHora(c.dataAgendada)}
            </div>
          </div>
        )}

        {c.resumo && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles aria-hidden className="h-3 w-3" /> Resumo da IA
            </div>
            <p className="text-xs leading-relaxed text-foreground/80">{c.resumo}</p>
          </div>
        )}

        {c.followupEm && c.followupTipo && (
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlarmClock aria-hidden className="h-3 w-3" /> Followup programado
            </div>
            <div className="text-sm font-medium" suppressHydrationWarning>
              {FOLLOWUP_ROTULO[c.followupTipo] ?? c.followupTipo} · {dataHora(c.followupEm)}
            </div>
            <div className="text-[11px] text-muted-foreground" suppressHydrationWarning>
              {desde(c.followupEm)}
            </div>
          </div>
        )}

        {c.nToques > 0 && (
          <p className="px-1 text-[11px] text-muted-foreground">
            {plural(c.nToques, "toque", "toques")} sem resposta do lead.
          </p>
        )}
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string | null;
  destaque?: boolean;
}) {
  if (!valor) return null;
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        destaque ? "border-destructive/30 bg-destructive/5" : "border-border bg-background",
      )}
    >
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="mt-0.5 text-sm font-medium">{valor}</div>
    </div>
  );
}
