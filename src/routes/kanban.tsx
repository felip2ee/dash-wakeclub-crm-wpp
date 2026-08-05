import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlarmClock,
  BellOff,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { dataHoraCompleta, diaRelativo } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirAdmin } from "@/server/auth";
import { getMensagens, type Mensagem } from "@/server/conversas";
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
              <div className="text-[11px] text-muted-foreground">
                {formatarTelefone(lead.telefone)}
              </div>
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
              aula {formatarDataHora(lead.dataAgendada)}
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{lead.nome ?? "Lead sem nome"}</DialogTitle>
          <DialogDescription>{formatarTelefone(lead.telefone)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 text-sm lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-4">
            <Detalhe
              titulo="Atendente responsável"
              valor={lead.atendenteNome ?? "Sem responsável"}
            />
            <Detalhe titulo="Etapa do funil" valor={lead.etiqueta} />

            {lead.resumo && (
              <section className="rounded-xl border border-border bg-muted/40 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Resumo
                </h4>
                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{lead.resumo}</p>
              </section>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Detalhe titulo="Temperatura" valor={lead.temperatura} />
              <Detalhe titulo="Origem" valor={lead.origem} />
              <Detalhe titulo="Interesse" valor={lead.interesse} />
              <Detalhe titulo="Objeção" valor={lead.objecao} />
              <Detalhe titulo="Toques sem resposta" valor={String(lead.nToques)} />
              <Detalhe
                titulo="Aula agendada"
                valor={lead.dataAgendada ? formatarDataHora(lead.dataAgendada) : null}
              />
            </div>

            {(lead.optOut || lead.semAtendimento) && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                {lead.optOut && (
                  <p className="flex items-center gap-1.5">
                    <BellOff className="h-3.5 w-3.5" /> Lead em opt-out.
                  </p>
                )}
                {lead.semAtendimento && (
                  <p>
                    Não atender
                    {lead.semAtendimentoMotivo ? ` · ${lead.semAtendimentoMotivo}` : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          <HistoricoDoLead leadId={lead.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoricoDoLead({ leadId }: { leadId: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["mensagens", leadId],
    queryFn: () => getMensagens({ data: { leadId } }),
    refetchInterval: RECARREGAR_A_CADA_MS,
  });

  return (
    <section className="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Histórico completo</h3>
          <p className="text-xs text-muted-foreground">
            {data
              ? `${data.length} ${data.length === 1 ? "mensagem" : "mensagens"}`
              : "Conversa do WhatsApp"}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 gap-1 text-[10px] font-normal">
          <MessageSquareText className="h-3 w-3" /> somente leitura
        </Badge>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
        {isPending && (
          <p className="py-10 text-center text-xs text-muted-foreground">
            Carregando todo o histórico…
          </p>
        )}
        {isError && (
          <p className="py-10 text-center text-xs text-destructive">{(error as Error).message}</p>
        )}
        {data?.length === 0 && (
          <p className="py-10 text-center text-xs text-muted-foreground">
            Este lead ainda não tem mensagens registradas.
          </p>
        )}
        {data && data.length > 0 && (
          <div className="flex flex-col gap-2">
            {data.map((mensagem, indice) => (
              <MensagemDoHistorico
                key={mensagem.id}
                mensagem={mensagem}
                anterior={data[indice - 1]}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MensagemDoHistorico({ mensagem, anterior }: { mensagem: Mensagem; anterior?: Mensagem }) {
  const daEquipe = mensagem.direcao !== "lead";
  const novoDia = !anterior || diaRelativo(mensagem.enviadaEm) !== diaRelativo(anterior.enviadaEm);
  const autor = mensagem.direcao === "lead" ? "Lead" : mensagem.direcao === "ia" ? "IA" : "Equipe";

  return (
    <>
      {novoDia && (
        <div
          className="mx-auto my-2 rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground"
          suppressHydrationWarning
        >
          {diaRelativo(mensagem.enviadaEm)}
        </div>
      )}

      <div className={cn("flex", daEquipe ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[88%] rounded-2xl px-3.5 py-2 shadow-sm",
            mensagem.direcao === "lead" && "rounded-bl-sm bg-card",
            mensagem.direcao === "equipe" && "rounded-br-sm bg-primary text-primary-foreground",
            mensagem.direcao === "ia" && "rounded-br-sm border border-amber-500/40 bg-amber-500/10",
          )}
        >
          <p
            className={cn(
              "mb-1 text-[10px] font-medium",
              mensagem.direcao === "equipe"
                ? "text-primary-foreground/75"
                : "text-muted-foreground",
            )}
          >
            {autor}
          </p>
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {mensagem.texto ?? <span className="italic opacity-60">(mensagem sem texto)</span>}
          </p>
          <p
            className={cn(
              "mt-1 text-right text-[10px]",
              mensagem.direcao === "equipe"
                ? "text-primary-foreground/70"
                : "text-muted-foreground",
            )}
            title={dataHoraCompleta(mensagem.enviadaEm)}
            suppressHydrationWarning
          >
            {dataHoraCompleta(mensagem.enviadaEm)}
          </p>
        </div>
      </div>
    </>
  );
}

function Detalhe({ titulo, valor }: { titulo: string; valor: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-0.5 leading-relaxed">{valor || "Não informado"}</p>
    </div>
  );
}

function ErroDeConexao({ error }: { error: Error }) {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <TriangleAlert className="mx-auto h-8 w-8 text-destructive" />
        <h2 className="mt-3 font-display text-base font-semibold">Não deu para ler o CRM</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Confira a <code className="font-mono">DATABASE_URL</code> no{" "}
          <code className="font-mono">.env</code> — ela precisa apontar para o banco{" "}
          <code className="font-mono">wakeclub</code> com a role read-only.
        </p>
      </div>
    </div>
  );
}

/** +5563981119636 → +55 63 98111-9636 */
function formatarTelefone(e164: string): string {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : e164;
}

function desde(isoDate: string): string {
  return formatDistanceToNow(new Date(isoDate), { addSuffix: true, locale: ptBR });
}

function formatarDataHora(isoDate: string): string {
  return new Date(isoDate).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
