import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  Bot,
  CalendarClock,
  Clock3,
  MessageSquareText,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { dataHoraCompleta, desde, rotuloAutoria, telefone } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { LeadCard } from "@/server/leads";
import {
  getOpportunityWorkspace,
  type EventoTimeline,
  type FiltroTimeline,
} from "@/server/opportunities";

const RECARREGAR_A_CADA_MS = 30_000;

const FILTROS: { valor: FiltroTimeline; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "mensagens", rotulo: "Mensagens" },
  { valor: "ia", rotulo: "IA" },
  { valor: "followups", rotulo: "Followups" },
  { valor: "equipe", rotulo: "Equipe" },
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

export function OpportunityWorkspace({ lead }: { lead: LeadCard }) {
  const [filtro, setFiltro] = useState<FiltroTimeline>("todos");
  const workspaceQuery = useQuery({
    queryKey: ["workspace", lead.id],
    queryFn: () => getOpportunityWorkspace({ data: { leadId: lead.id } }),
    refetchInterval: RECARREGAR_A_CADA_MS,
  });

  const mensagens = workspaceQuery.data?.mensagens ?? [];
  const qualificacoes = workspaceQuery.data?.qualificacoes ?? [];
  const followups = workspaceQuery.data?.followups ?? [];
  const eventos = workspaceQuery.data?.timeline ?? [];
  const eventosFiltrados =
    filtro === "todos" ? eventos : eventos.filter((evento) => evento.categorias.includes(filtro));
  const proximoFollowup = followups.find((item) => item.status === "pendente");
  const ultimaAcaoEquipe = [...mensagens]
    .reverse()
    .find((mensagem) => mensagem.direcao === "equipe");
  const ultimaQualificacao = qualificacoes[0];
  const carregando = workspaceQuery.isPending;
  const erro = workspaceQuery.error;
  const proximaAcao = proximoFollowup
    ? `${FOLLOWUP_ROTULO[proximoFollowup.tipo] ?? proximoFollowup.tipo} ${desde(proximoFollowup.agendadoPara)}`
    : lead.aguardandoEquipe
      ? "Equipe precisa responder ao lead"
      : "Aguardar nova mensagem ou decisão do WF-02";

  return (
    // Tela cheia no celular: desconta o entalhe e a área segura (viewport-fit=cover) e
    // desce o X do Dialog (último botão) junto.
    <DialogContent className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:[&>button:last-child]:top-[calc(1rem+env(safe-area-inset-top))] sm:h-[92dvh] sm:w-[82vw] sm:max-w-[82vw] sm:rounded-xl sm:border">
      <header className="border-b border-border bg-card px-4 py-4 pr-12 sm:px-6 sm:py-5 sm:pr-14">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-xl sm:text-2xl">
              {lead.nome ?? "Lead sem nome"}
            </DialogTitle>
            {lead.temperatura && (
              <Badge className={cn("capitalize", TEMPERATURA_ESTILO[lead.temperatura])}>
                {lead.temperatura}
              </Badge>
            )}
            <Badge variant="outline">{lead.etiqueta}</Badge>
          </div>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{telefone(lead.telefone)}</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> somente leitura
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <CabecalhoItem
            titulo="Responsável"
            valor={lead.atendenteNome ?? "Sem responsável"}
            icone={<UserRound className="h-4 w-4" />}
          />
          <CabecalhoItem titulo="Origem" valor={lead.origem ?? "Não informada"} />
          <CabecalhoItem
            titulo="Última interação"
            valor={lead.ultimaMsgEm ? dataHoraCompleta(lead.ultimaMsgEm) : "Sem mensagens"}
            icone={<Clock3 className="h-4 w-4" />}
          />
          <CabecalhoItem
            titulo="Próximo followup"
            valor={
              proximoFollowup
                ? dataHoraCompleta(proximoFollowup.agendadoPara)
                : lead.followupEm
                  ? dataHoraCompleta(lead.followupEm)
                  : "Nenhum pendente"
            }
            icone={<AlarmClock className="h-4 w-4" />}
          />
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.6fr)]">
          <aside className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-semibold">Resumo operacional</h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Contador
                  valor={workspaceQuery.isPending ? "…" : mensagens.length}
                  rotulo="mensagens"
                />
                <Contador
                  valor={workspaceQuery.isPending ? "…" : followups.length}
                  rotulo="followups"
                />
                <Contador valor={lead.nToques} rotulo="toques" />
              </div>

              <div className="mt-4 space-y-3">
                <Detalhe titulo="Interesse" valor={lead.interesse} />
                <Detalhe titulo="Objeção" valor={lead.objecao} />
                <Detalhe titulo="Resumo da IA" valor={ultimaQualificacao?.resumo ?? lead.resumo} />
                <Detalhe
                  titulo="Agendamento"
                  valor={lead.dataAgendada ? dataHoraCompleta(lead.dataAgendada) : null}
                  icone={<CalendarClock className="h-3.5 w-3.5" />}
                />
                <Detalhe
                  titulo="Última ação da equipe"
                  valor={
                    ultimaAcaoEquipe
                      ? `${dataHoraCompleta(ultimaAcaoEquipe.enviadaEm)}${
                          ultimaAcaoEquipe.texto ? ` · ${ultimaAcaoEquipe.texto}` : ""
                        }`
                      : null
                  }
                />
                <Detalhe titulo="Próxima ação esperada" valor={proximaAcao} />
              </div>
            </section>

            {(lead.optOut || lead.semAtendimento) && (
              <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                {lead.optOut && <p>Lead em opt-out.</p>}
                {lead.semAtendimento && (
                  <p>
                    Não atender
                    {lead.semAtendimentoMotivo ? ` · ${lead.semAtendimentoMotivo}` : ""}
                  </p>
                )}
              </section>
            )}
          </aside>

          <main className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold">Timeline da oportunidade</h2>
                <p className="text-xs text-muted-foreground">
                  Conversa, decisões da IA e ciclo dos followups · mais recentes primeiro
                </p>
              </div>
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
                {FILTROS.map((item) => (
                  <button
                    key={item.valor}
                    type="button"
                    aria-pressed={filtro === item.valor}
                    onClick={() => setFiltro(item.valor)}
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      filtro === item.valor
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.rotulo}
                  </button>
                ))}
              </div>
            </div>

            {erro && (
              <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Parte do histórico não pôde ser carregada: {(erro as Error).message}
              </p>
            )}
            {carregando && eventos.length === 0 && (
              <p className="mt-4 rounded-xl border border-border py-12 text-center text-sm text-muted-foreground">
                Carregando o contexto da oportunidade…
              </p>
            )}
            {!carregando && eventosFiltrados.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                Nenhum evento encontrado neste filtro.
              </p>
            )}
            {eventosFiltrados.length > 0 && (
              <ol className="mt-4 space-y-3">
                {eventosFiltrados.map((evento) => (
                  <li key={evento.id}>
                    <Evento evento={evento} />
                  </li>
                ))}
              </ol>
            )}
          </main>
        </div>
      </ScrollArea>
    </DialogContent>
  );
}

function CabecalhoItem({
  titulo,
  valor,
  icone,
}: {
  titulo: string;
  valor: string;
  icone?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 truncate font-medium" title={valor}>
        {icone}
        <span className="truncate">{valor}</span>
      </p>
    </div>
  );
}

function Contador({ valor, rotulo }: { valor: number | string; rotulo: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2 text-center">
      <p className="text-lg font-semibold">{valor}</p>
      <p className="truncate text-[10px] text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function Detalhe({
  titulo,
  valor,
  icone,
}: {
  titulo: string;
  valor: string | null;
  icone?: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icone}
        {titulo}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {valor || "Não informado"}
      </p>
    </div>
  );
}

function Evento({ evento }: { evento: EventoTimeline }) {
  if (evento.tipo === "mensagem") {
    const { mensagem } = evento;
    const autor =
      mensagem.direcao === "lead"
        ? "Lead"
        : mensagem.direcao === "ia"
          ? "IA"
          : rotuloAutoria(mensagem.autoria);
    return (
      <article
        className={cn(
          "rounded-xl border p-3.5",
          mensagem.direcao === "ia"
            ? "border-amber-500/30 bg-amber-500/5"
            : mensagem.direcao === "equipe"
              ? "border-primary/25 bg-primary/5"
              : "border-border bg-card",
        )}
      >
        <div className="flex items-center justify-between gap-3 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            {mensagem.direcao === "ia" ? (
              <Bot className="h-3.5 w-3.5" />
            ) : (
              <MessageSquareText className="h-3.5 w-3.5" />
            )}
            Mensagem · {autor}
          </p>
          <time className="shrink-0 text-muted-foreground" suppressHydrationWarning>
            {dataHoraCompleta(evento.ocorridoEm)}
          </time>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {mensagem.texto ?? (
            <span className="italic text-muted-foreground">Mensagem sem texto</span>
          )}
        </p>
      </article>
    );
  }

  if (evento.tipo === "decisao_ia") {
    const q = evento.qualificacao;
    return (
      <article className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            <Bot className="h-3.5 w-3.5" /> Decisão do Qualificador IA
          </p>
          <time className="text-muted-foreground" suppressHydrationWarning>
            {dataHoraCompleta(evento.ocorridoEm)}
          </time>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {q.etiqueta && <Badge variant="outline">Etapa: {q.etiqueta}</Badge>}
          {q.temperatura && (
            <Badge variant="outline" className="capitalize">
              Temperatura: {q.temperatura}
            </Badge>
          )}
          {q.mudouEtiqueta && q.etiquetaAnterior && (
            <Badge variant="secondary">
              {q.etiquetaAnterior} → {q.etiqueta}
            </Badge>
          )}
          {q.mudouTemperatura && q.temperaturaAnterior && (
            <Badge variant="secondary" className="capitalize">
              {q.temperaturaAnterior} → {q.temperatura}
            </Badge>
          )}
        </div>
        {q.resumo && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{q.resumo}</p>}
        {(q.interesse || q.objecao) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {[q.interesse && `Interesse: ${q.interesse}`, q.objecao && `Objeção: ${q.objecao}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </article>
    );
  }

  const f = evento.followup;
  const titulo =
    evento.tipo === "followup_enviado"
      ? "Followup enviado"
      : evento.tipo === "followup_cancelado"
        ? f.status === "abortado"
          ? "Followup barrado pelo Porteiro"
          : "Followup cancelado"
        : "Followup criado";
  const texto =
    evento.tipo === "followup_enviado"
      ? f.textoEnviado
      : evento.tipo === "followup_cancelado"
        ? f.motivoCancelamento
        : f.motivo;

  return (
    <article className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="flex items-center gap-1.5 font-medium">
          <AlarmClock className="h-3.5 w-3.5" /> {titulo}
        </p>
        <time className="text-muted-foreground" suppressHydrationWarning>
          {dataHoraCompleta(evento.ocorridoEm)}
        </time>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="outline">{FOLLOWUP_ROTULO[f.tipo] ?? f.tipo}</Badge>
        <Badge variant="secondary">{f.status}</Badge>
        {evento.tipo === "followup_criado" && (
          <Badge variant="outline">para {dataHoraCompleta(f.agendadoPara)}</Badge>
        )}
      </div>
      {texto && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{texto}</p>}
      {evento.tipo === "followup_criado" && f.textoSugerido && (
        <p className="mt-2 rounded-lg bg-muted/60 p-2.5 text-xs leading-relaxed">
          <strong>Sugestão:</strong> {f.textoSugerido}
        </p>
      )}
    </article>
  );
}
