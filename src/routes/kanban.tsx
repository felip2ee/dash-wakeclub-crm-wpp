import { createFileRoute, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import {
  AlarmClock,
  CalendarClock,
  Clock,
  MessageSquareText,
  RefreshCw,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { OpportunityWorkspace } from "@/features/opportunities/OpportunityWorkspace";
import { dataHora, desde, telefone } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirAdmin } from "@/server/auth";
import { getLeadsPainel, type LeadCard } from "@/server/leads";

/**
 * Kanban do CRM — ESPELHO, só leitura.
 *
 * Quem escreve nos leads é o WF-02 (Qualificador). Se este painel também
 * escrevesse, os dois brigariam pela etiqueta do mesmo lead a cada
 * qualificação. Por isso não há arrastar card, nem botão de criar, nem edição.
 */

const RECARREGAR_A_CADA_MS = 30_000;

/** As colunas são as etapas do funil do playbook (§24), nesta ordem. */
const COLUNAS: { etiqueta: string; cor: string }[] = [
  { etiqueta: "Novo Lead", cor: "oklch(0.7 0.02 250)" },
  { etiqueta: "Atendimento", cor: "oklch(0.62 0.14 240)" },
  { etiqueta: "Link enviado", cor: "oklch(0.6 0.13 200)" },
  { etiqueta: "Aguardando pagamento", cor: "oklch(0.72 0.15 78)" },
  { etiqueta: "Agendado", cor: "oklch(0.55 0.18 300)" },
  { etiqueta: "Aula realizada", cor: "oklch(0.55 0.16 158)" },
  { etiqueta: "Follow-up", cor: "oklch(0.65 0.17 45)" },
  { etiqueta: "Negociação encerrada", cor: "oklch(0.55 0.08 20)" },
];

const TEMPERATURA_ESTILO: Record<string, string> = {
  quente: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  morno: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  frio: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

const FOLLOWUP_ROTULO: Record<string, string> = {
  reengajar: "reengajar",
  lembrete_d1: "lembrete D-1",
  lembrete_dia: "lembrete do dia",
  pos_aula: "pós-aula",
  reativacao: "reativação",
};

export const Route = createFileRoute("/kanban")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({
    meta: [
      { title: "Todos os leads — Wake Club CRM" },
      {
        name: "description",
        content: "Funil de leads da Wake Club por etapa do playbook.",
      },
    ],
  }),
  loader: (): Promise<LeadCard[]> => getLeadsPainel(),
  errorComponent: ErroDeConexao,
  component: KanbanPage,
});

function KanbanPage() {
  const leads: LeadCard[] = Route.useLoaderData();
  const router = useRouter();
  const [busca, setBusca] = useState("");

  // Espelho: sem isto a tela congela no estado do primeiro carregamento.
  useEffect(() => {
    const t = setInterval(() => void router.invalidate(), RECARREGAR_A_CADA_MS);
    return () => clearInterval(t);
  }, [router]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return leads;
    return leads.filter(
      (l) =>
        l.nome?.toLowerCase().includes(termo) ||
        l.telefone.includes(termo) ||
        l.interesse?.toLowerCase().includes(termo) ||
        l.objecao?.toLowerCase().includes(termo),
    );
  }, [leads, busca]);

  const aguardando = filtrados.filter((l) => l.aguardandoEquipe).length;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold tracking-tight sm:text-xl">
            Todos os leads
          </h1>
          <p className="truncate text-xs text-muted-foreground sm:text-sm">
            {filtrados.length} {filtrados.length === 1 ? "lead" : "leads"}
            {aguardando > 0 && ` · ${aguardando} aguardando a equipe`}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone, interesse…"
              className="h-9 w-full pl-8 sm:w-72"
            />
          </div>
          <Badge
            variant="outline"
            className="hidden h-9 gap-1.5 rounded-full px-3 font-normal text-muted-foreground sm:flex"
          >
            <RefreshCw className="h-3 w-3" /> espelho · atualiza sozinho
          </Badge>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="flex gap-4 p-4 sm:p-6">
          {COLUNAS.map((coluna) => {
            const itens = filtrados.filter((l) => l.etiqueta === coluna.etiqueta);
            return (
              <div key={coluna.etiqueta} className="flex w-[280px] shrink-0 flex-col sm:w-[300px]">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: coluna.cor }}
                  />
                  <h2 className="truncate text-sm font-semibold">{coluna.etiqueta}</h2>
                  <Badge
                    variant="secondary"
                    className="h-5 shrink-0 rounded-full px-1.5 text-[10px]"
                  >
                    {itens.length}
                  </Badge>
                </div>

                <div className="flex flex-col gap-2.5">
                  {itens.map((lead) => (
                    <CardDoLead key={lead.id} lead={lead} />
                  ))}
                  {itens.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border bg-background/50 p-6 text-center text-[11px] text-muted-foreground">
                      Nenhum lead nesta etapa
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

function CardDoLead({ lead }: { lead: LeadCard }) {
  // 4h esperando é o limite que o time considera atraso.
  const atrasado = (lead.horasEsperando ?? 0) >= 4;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">
                {lead.nome ?? "Sem nome"}
              </div>
              <div className="text-[11px] text-muted-foreground">{telefone(lead.telefone)}</div>
            </div>
            {lead.temperatura && (
              <span
                className={cn(
                  "shrink-0 text-[10px] font-medium capitalize",
                  TEMPERATURA_ESTILO[lead.temperatura].split(" ").at(-1),
                )}
              >
                {lead.temperatura}
              </span>
            )}
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <UserRound className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate">{lead.atendenteNome ?? "Sem atendente responsável"}</span>
          </div>

          {lead.dataAgendada && (
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              <CalendarClock className="h-3 w-3 shrink-0" />
              aula {dataHora(lead.dataAgendada)}
            </div>
          )}

          <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <MessageSquareText className="h-3 w-3 shrink-0" />
              <span className="truncate" suppressHydrationWarning>
                {lead.ultimaMsgEm ? `última msg ${desde(lead.ultimaMsgEm)}` : "sem mensagens"}
              </span>
            </div>
            {lead.aguardandoEquipe && lead.horasEsperando !== null && (
              <div
                className={cn(
                  "flex shrink-0 items-center gap-1",
                  atrasado ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                <Clock className="h-3 w-3" /> {lead.horasEsperando}h
              </div>
            )}
          </div>

          {lead.followupTipo && lead.followupEm && (
            <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-[11px] text-muted-foreground">
              <AlarmClock className="h-3 w-3 shrink-0" />
              <span className="truncate" suppressHydrationWarning>
                {FOLLOWUP_ROTULO[lead.followupTipo] ?? lead.followupTipo} {desde(lead.followupEm)}
              </span>
            </div>
          )}

          {lead.nToques > 0 && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              {lead.nToques} {lead.nToques === 1 ? "toque" : "toques"} sem resposta
            </div>
          )}
        </button>
      </DialogTrigger>
      <OpportunityWorkspace lead={lead} />
    </Dialog>
  );
}

function ErroDeConexao({ error }: ErrorComponentProps) {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <TriangleAlert className="mx-auto h-8 w-8 text-destructive" />
        <h2 className="mt-3 font-display text-base font-semibold">Não deu para ler o CRM</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Confira a <code className="font-mono">DATABASE_URL</code> no{" "}
          <code className="font-mono">.env</code> — ela precisa apontar para o banco{" "}
          <code className="font-mono">wakeclub</code> com a role read-only.
        </p>
      </div>
    </div>
  );
}
