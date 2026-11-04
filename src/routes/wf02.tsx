import { createFileRoute, Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import {
  AlarmClock,
  ArrowRight,
  Ban,
  Bot,
  CircleAlert,
  CircleHelp,
  Clock,
  Hourglass,
  Info,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dataHoraCompleta, desde, iniciais, plural, telefone as fmtTelefone } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirAdmin } from "@/server/auth";
import {
  getPainelWf02,
  type Followup,
  type LeadNoMotor,
  type PainelWf02,
  type QualificacaoIA,
  type SituacaoMotor,
} from "@/server/wf02";

/**
 * Motor de IA (WF-02) — a aba que existe para INTERPRETAR o Qualificador.
 *
 * O WF-02 não tem log. O que ele deixa é rastro em três tabelas, e o trabalho
 * desta tela é transformar rastro em explicação: o que a IA decidiu, o que ela
 * mudou de ideia, o que está na fila e o que quebrou.
 *
 * Só leitura, como o resto do painel.
 */

const RECARREGAR_A_CADA_MS = 30_000;

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

const STATUS_ESTILO: Record<string, string> = {
  pendente: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  enviando: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  enviado: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelado: "border-border bg-muted text-muted-foreground",
  abortado: "border-destructive/30 bg-destructive/5 text-destructive",
};

const SITUACAO: Record<
  SituacaoMotor,
  { rotulo: string; estilo: string; grave: boolean; explica: string }
> = {
  "suspeita de retry de falha": {
    rotulo: "retry de falha",
    estilo: "border-destructive/40 bg-destructive/10 text-destructive",
    grave: true,
    explica:
      "O relógio deste lead está longe demais no futuro para ter vindo do debounce normal. Só o tratamento de erro do WF-02 escreve assim: alguma execução quebrou.",
  },
  orfao: {
    rotulo: "órfão",
    estilo: "border-destructive/40 bg-destructive/10 text-destructive",
    grave: true,
    explica:
      "Tem conversa, não está na fila e nunca foi qualificado. Caiu no vão entre reivindicar e gravar — a IA nunca vai olhar para ele sozinha.",
  },
  vencido: {
    rotulo: "vencido",
    estilo: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    grave: false,
    explica:
      "A hora já passou e o lead ainda está na fila. Normal por poucos minutos; se persistir, o WF-02 está desligado ou travado.",
  },
  "na fila": {
    rotulo: "na fila",
    estilo: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    grave: false,
    explica: "Esperando os ~2 minutos de silêncio do debounce. É o estado saudável.",
  },
  ok: {
    rotulo: "em dia",
    estilo: "border-border bg-muted text-muted-foreground",
    grave: false,
    explica: "Nada pendente. A IA já olhou este lead e não há mensagem nova.",
  },
  "opt-out": {
    rotulo: "opt-out",
    estilo: "border-border bg-muted text-muted-foreground",
    grave: false,
    explica: "Pediu para parar. A automação nunca mais toca neste lead.",
  },
};

export const Route = createFileRoute("/wf02")({
  validateSearch: z.object({
    aba: z.enum(["timeline", "porlead", "fila", "followups"]).optional(),
  }),
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({
    meta: [
      { title: "IA e followups — Wake Club CRM" },
      {
        name: "description",
        content: "O que o Qualificador IA decidiu, o que está na fila e o que falhou.",
      },
    ],
  }),
  loader: (): Promise<PainelWf02> => getPainelWf02(),
  errorComponent: ErroDeConexao,
  component: Wf02Page,
});

function Wf02Page() {
  const { atividade, motor, followups } = Route.useLoaderData();
  const { aba } = Route.useSearch();
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => void router.invalidate(), RECARREGAR_A_CADA_MS);
    return () => clearInterval(t);
  }, [router]);

  const problemas = motor.filter((m) => SITUACAO[m.situacao].grave).length;
  const naFila = motor.filter((m) => m.situacao === "na fila" || m.situacao === "vencido").length;
  const pendentes = followups.filter((f) => f.status === "pendente").length;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <header className="border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight sm:text-xl">
              <Bot className="h-5 w-5 text-primary" />
              IA e followups · WF-02
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {plural(atividade.length, "qualificação", "qualificações")} · {naFila} na fila ·{" "}
              {plural(pendentes, "followup", "followups")} pendente
              {problemas > 0 && (
                <span className="font-medium text-destructive">
                  {" "}
                  · {plural(problemas, "lead com problema", "leads com problema")}
                </span>
              )}
            </p>
          </div>
          <Badge
            variant="outline"
            className="hidden h-9 shrink-0 gap-1.5 rounded-full px-3 font-normal text-muted-foreground sm:flex"
          >
            <RefreshCw className="h-3 w-3" /> atualiza sozinho
          </Badge>
        </div>
      </header>

      <Tabs defaultValue={aba ?? "timeline"} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b border-border bg-card px-4 sm:px-6">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-0 bg-transparent p-0">
            <Aba valor="timeline">Linha do tempo</Aba>
            <Aba valor="porlead">Por lead</Aba>
            <Aba valor="fila">
              Fila e saúde
              {problemas > 0 && (
                <span className="ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {problemas}
                </span>
              )}
            </Aba>
            <Aba valor="followups">Followups</Aba>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-[1100px] p-4 sm:p-6">
            <TabsContent value="timeline" className="mt-0">
              <AbaTimeline itens={atividade} />
            </TabsContent>
            <TabsContent value="porlead" className="mt-0">
              <AbaPorLead itens={atividade} />
            </TabsContent>
            <TabsContent value="fila" className="mt-0">
              <AbaFila itens={motor} />
            </TabsContent>
            <TabsContent value="followups" className="mt-0">
              <AbaFollowups itens={followups} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function Aba({ valor, children }: { valor: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={valor}
      className="shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      {children}
    </TabsTrigger>
  );
}

/** O bloco que explica o que a aba significa. É o ponto da tela inteira. */
function Explicacao({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// ==================================================== 1. linha do tempo

function AbaTimeline({ itens }: { itens: QualificacaoIA[] }) {
  return (
    <>
      <Explicacao>
        <p>
          Cada linha é <strong>uma decisão do Qualificador</strong>: ele leu a conversa até aquele
          instante e devolveu etiqueta, temperatura, interesse, objeção e um resumo. Isso vem do{" "}
          <code className="font-mono">crm_outbox</code>, que é o único rastro que o WF-02 deixa —
          ele não tem log próprio.
        </p>
        <p>
          A seta <ArrowRight className="inline h-3 w-3" /> aparece quando a IA{" "}
          <strong>mudou de ideia</strong> sobre um lead que já tinha qualificado antes. É o que você
          quer ler para saber se ela acompanha a conversa ou se está chutando.
        </p>
      </Explicacao>

      {itens.length === 0 ? (
        <Vazio
          icone={Sparkles}
          titulo="A IA ainda não qualificou ninguém"
          detalhe="Ou o WF-02 está inativo no n8n, ou nenhum lead entrou na fila. A aba 'Fila e saúde' mostra qual dos dois."
        />
      ) : (
        <ol className="space-y-2.5">
          {itens.map((q) => (
            <li key={q.id}>
              <CardQualificacao q={q} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function CardQualificacao({ q }: { q: QualificacaoIA }) {
  return (
    <article className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {iniciais(q.nome)}
          </span>
          <div className="min-w-0">
            <Link
              to="/"
              search={{ lead: q.leadId }}
              className="truncate text-sm font-semibold hover:underline"
            >
              {q.nome ?? fmtTelefone(q.telefone)}
            </Link>
            <div className="text-[11px] text-muted-foreground">
              {q.nQualificacao}ª de {q.totalQualificacoes} qualificações
            </div>
          </div>
        </div>
        <div className="text-right text-[11px] text-muted-foreground" suppressHydrationWarning>
          {dataHoraCompleta(q.qualificadoEm)}
          <div>{desde(q.qualificadoEm)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Transicao de={q.etiquetaAnterior} para={q.etiqueta} mudou={q.mudouEtiqueta} />
        <Transicao
          de={q.temperaturaAnterior}
          para={q.temperatura}
          mudou={q.mudouTemperatura}
          estilo={q.temperatura ? TEMPERATURA_ESTILO[q.temperatura] : undefined}
        />
        {q.interesse && (
          <Badge
            variant="outline"
            className="h-5 rounded-full border-primary/30 bg-primary/5 px-1.5 text-[10px] text-primary"
          >
            {q.interesse}
          </Badge>
        )}
        {q.objecao && (
          <Badge
            variant="outline"
            className="h-5 gap-1 rounded-full border-destructive/30 bg-destructive/5 px-1.5 text-[10px] text-destructive"
          >
            <TriangleAlert className="h-2.5 w-2.5" />
            {q.objecao}
          </Badge>
        )}
      </div>

      {q.resumo && (
        <p className="mt-2.5 border-l-2 border-primary/30 pl-2.5 text-xs leading-relaxed text-foreground/75">
          {q.resumo}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
        {q.gerouFollowup && q.followupTipo ? (
          <span className="flex items-center gap-1.5" suppressHydrationWarning>
            <AlarmClock className="h-3 w-3 shrink-0" />
            agendou{" "}
            <strong className="font-medium text-foreground">
              {FOLLOWUP_ROTULO[q.followupTipo] ?? q.followupTipo}
            </strong>{" "}
            para {dataHoraCompleta(q.followupAgendadoPara)}
            {q.followupStatus && q.followupStatus !== "pendente" && (
              <Badge
                variant="outline"
                className={cn(
                  "h-4 rounded-full px-1.5 text-[10px]",
                  STATUS_ESTILO[q.followupStatus],
                )}
              >
                {q.followupStatus}
              </Badge>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Ban className="h-3 w-3 shrink-0" />
            decidiu não agendar followup
          </span>
        )}
        {q.followupMotivo && <span className="italic">"{q.followupMotivo}"</span>}
      </div>
    </article>
  );
}

/** Mostra "Atendimento → Follow-up" quando mudou; só o valor quando não. */
function Transicao({
  de,
  para,
  mudou,
  estilo,
}: {
  de: string | null;
  para: string | null;
  mudou: boolean | null;
  estilo?: string;
}) {
  if (!para) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {mudou && de && (
        <>
          <Badge
            variant="outline"
            className="h-5 rounded-full px-1.5 text-[10px] capitalize text-muted-foreground line-through decoration-1"
          >
            {de}
          </Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
        </>
      )}
      <Badge
        variant="outline"
        className={cn(
          "h-5 rounded-full px-1.5 text-[10px] capitalize",
          estilo,
          mudou && "font-semibold",
        )}
      >
        {para}
      </Badge>
    </span>
  );
}

// ======================================================== 2. por lead

function AbaPorLead({ itens }: { itens: QualificacaoIA[] }) {
  const porLead = useMemo(() => {
    const mapa = new Map<string, QualificacaoIA[]>();
    for (const q of itens) {
      const lista = mapa.get(q.leadId);
      if (lista) lista.push(q);
      else mapa.set(q.leadId, [q]);
    }
    // Já vêm ordenadas por data desc; dentro do lead queremos a mais nova em cima.
    return [...mapa.values()].sort(
      (a, b) => +new Date(b[0].qualificadoEm) - +new Date(a[0].qualificadoEm),
    );
  }, [itens]);

  return (
    <>
      <Explicacao>
        <p>
          A mesma informação da linha do tempo, mas <strong>agrupada por lead</strong>: o histórico
          completo de como a IA foi mudando de opinião sobre cada pessoa, da qualificação mais
          recente para a mais antiga.
        </p>
        <p>
          É aqui que se responde a pergunta da Fase 2 do roadmap:{" "}
          <strong>a IA etiqueta como um humano etiquetaria?</strong> Leia o resumo da última
          qualificação, abra a conversa no link do nome e compare.
        </p>
      </Explicacao>

      {porLead.length === 0 ? (
        <Vazio
          icone={Sparkles}
          titulo="Nenhum lead qualificado ainda"
          detalhe="Quando o WF-02 rodar, cada lead aparece aqui com o histórico das decisões."
        />
      ) : (
        <div className="space-y-3">
          {porLead.map((historico) => {
            const atual = historico[0];
            return (
              <article key={atual.leadId} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                      {iniciais(atual.nome)}
                    </span>
                    <div className="min-w-0">
                      <Link
                        to="/"
                        search={{ lead: atual.leadId }}
                        className="flex items-center gap-1.5 truncate text-sm font-semibold hover:underline"
                      >
                        {atual.nome ?? fmtTelefone(atual.telefone)}
                        <MessageSquareText className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtTelefone(atual.telefone)}
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 rounded-full text-[10px]">
                    {plural(historico.length, "qualificação", "qualificações")}
                  </Badge>
                </div>

                <ol className="space-y-0 border-l border-border pl-3">
                  {historico.map((q) => (
                    <li key={q.id} className="relative py-2">
                      <span className="absolute -left-[17px] top-3.5 h-2 w-2 rounded-full bg-border ring-4 ring-card" />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="shrink-0 text-[11px] text-muted-foreground"
                          suppressHydrationWarning
                        >
                          {dataHoraCompleta(q.qualificadoEm)}
                        </span>
                        <Transicao
                          de={q.etiquetaAnterior}
                          para={q.etiqueta}
                          mudou={q.mudouEtiqueta}
                        />
                        <Transicao
                          de={q.temperaturaAnterior}
                          para={q.temperatura}
                          mudou={q.mudouTemperatura}
                          estilo={q.temperatura ? TEMPERATURA_ESTILO[q.temperatura] : undefined}
                        />
                      </div>
                      {q.resumo && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {q.resumo}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

// ==================================================== 3. fila e saúde

function AbaFila({ itens }: { itens: LeadNoMotor[] }) {
  const [soProblemas, setSoProblemas] = useState(false);

  const contagem = useMemo(() => {
    const c = {} as Record<SituacaoMotor, number>;
    for (const m of itens) c[m.situacao] = (c[m.situacao] ?? 0) + 1;
    return c;
  }, [itens]);

  const graves = itens.filter((m) => SITUACAO[m.situacao].grave);
  const visiveis = soProblemas ? graves : itens.filter((m) => m.situacao !== "ok");

  return (
    <>
      <Explicacao>
        <p>
          O WF-02 roda a cada minuto e olha só quem tem{" "}
          <code className="font-mono">qualificar_apos</code> vencido. Esta aba mostra o estado desse
          relógio em cada lead — ou seja, <strong>o que a IA vai olhar, e quando</strong>.
        </p>
        <p>
          Os dois estados em vermelho são os que pedem ação. <strong>Retry de falha</strong>{" "}
          significa que uma execução quebrou e o lead foi reagendado pelo tratamento de erro.{" "}
          <strong>Órfão</strong> significa que o lead tem conversa mas ninguém vai olhar para ele —
          é o risco conhecido do padrão de reivindicar-e-zerar.
        </p>
      </Explicacao>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(SITUACAO) as SituacaoMotor[]).map((s) => (
          <div
            key={s}
            className={cn(
              "rounded-xl border p-2.5",
              SITUACAO[s].grave && (contagem[s] ?? 0) > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-card",
            )}
            title={SITUACAO[s].explica}
          >
            <div className="font-display text-xl font-semibold">{contagem[s] ?? 0}</div>
            <div className="text-[11px] leading-tight text-muted-foreground">
              {SITUACAO[s].rotulo}
            </div>
          </div>
        ))}
      </div>

      {graves.length > 0 && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <CircleAlert className="h-4 w-4" />
            {plural(graves.length, "lead precisa", "leads precisam")} de atenção
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {[...new Set(graves.map((g) => g.situacao))].map((s) => (
              <li key={s}>
                <strong className="text-foreground">{SITUACAO[s].rotulo}:</strong>{" "}
                {SITUACAO[s].explica}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {soProblemas ? "Só os problemas" : "Leads com algo pendente"}
        </h3>
        <button
          onClick={() => setSoProblemas((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {soProblemas ? "mostrar todos os pendentes" : "mostrar só os problemas"}
        </button>
      </div>

      {visiveis.length === 0 ? (
        <Vazio
          icone={Hourglass}
          titulo="Fila vazia"
          detalhe="Nenhum lead esperando qualificação e nenhum problema detectado. Se a IA nunca rodou, isso também aparece assim — confira a linha do tempo."
        />
      ) : (
        <ul className="space-y-2">
          {visiveis.map((m) => (
            <li key={m.leadId}>
              <LinhaDoMotor m={m} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function LinhaDoMotor({ m }: { m: LeadNoMotor }) {
  const s = SITUACAO[m.situacao];

  return (
    <article
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-card p-3",
        s.grave ? "border-destructive/40" : "border-border",
      )}
    >
      <Badge
        variant="outline"
        className={cn("h-5 shrink-0 rounded-full px-2 text-[10px]", s.estilo)}
      >
        {s.rotulo}
      </Badge>

      <Link
        to="/"
        search={{ lead: m.leadId }}
        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
      >
        {m.nome ?? fmtTelefone(m.telefone)}
      </Link>

      <span className="shrink-0 truncate rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
        {m.etiqueta}
      </span>

      <span
        className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
        suppressHydrationWarning
      >
        <MessageSquareText className="h-3 w-3" />
        {m.totalMensagens}
      </span>

      <span className="shrink-0 text-[11px] text-muted-foreground">
        {m.vezesQualificado === 0
          ? "nunca qualificado"
          : plural(m.vezesQualificado, "qualificação", "qualificações")}
      </span>

      {m.qualificarApos && (
        <span
          className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
          suppressHydrationWarning
        >
          <Clock className="h-3 w-3" />
          {m.minutosParaVencer !== null && m.minutosParaVencer <= 0
            ? `vencido há ${Math.abs(m.minutosParaVencer)}min`
            : `em ${m.minutosParaVencer}min`}
        </span>
      )}
    </article>
  );
}

// ====================================================== 4. followups

function AbaFollowups({ itens }: { itens: Followup[] }) {
  const pendentes = itens.filter((f) => f.status === "pendente");
  const historico = itens.filter((f) => f.status !== "pendente");
  const abortados = itens.filter((f) => f.status === "abortado").length;

  return (
    <>
      <Explicacao>
        <p>
          A agenda que a IA montou. Cada followup nasce de uma qualificação: a IA leu a conversa,
          decidiu que o lead precisa de um toque, e escolheu <strong>quando</strong> e{" "}
          <strong>por quê</strong>. Só existe <strong>um pendente por lead</strong> — qualificar de
          novo cancela o anterior.
        </p>
        <p>
          <strong>cancelado</strong> = a conversa andou e a IA descartou o toque.{" "}
          <strong>abortado</strong> = o Porteiro barrou na hora de disparar (isso só acontece quando
          o WF-03 existir). A proporção de abortados é o termômetro do §10: muito alta significa que
          o Porteiro está paranoico; zero, que ele não está olhando nada.
        </p>
      </Explicacao>

      {itens.length === 0 ? (
        <Vazio
          icone={AlarmClock}
          titulo="Nenhum followup criado"
          detalhe="A IA ainda não achou motivo para programar um toque — ou não qualificou ninguém ainda."
        />
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2.5 text-sm font-semibold">
              Pendentes{" "}
              <span className="font-normal text-muted-foreground">({pendentes.length})</span>
            </h3>
            {pendentes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Nada agendado no momento.
              </p>
            ) : (
              <ul className="space-y-2">
                {pendentes.map((f) => (
                  <li key={f.id}>
                    <CardFollowup f={f} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {historico.length > 0 && (
            <section>
              <h3 className="mb-2.5 text-sm font-semibold">
                Histórico{" "}
                <span className="font-normal text-muted-foreground">
                  ({historico.length}
                  {abortados > 0 && ` · ${abortados} abortado`})
                </span>
              </h3>
              <ul className="space-y-2">
                {historico.map((f) => (
                  <li key={f.id}>
                    <CardFollowup f={f} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function CardFollowup({ f }: { f: Followup }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/30 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            f.vencido ? "border-amber-500/40" : "border-border",
          )}
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <Badge
              variant="outline"
              className={cn("h-5 shrink-0 rounded-full px-2 text-[10px]", STATUS_ESTILO[f.status])}
            >
              {f.status}
            </Badge>
            <Badge variant="secondary" className="h-5 shrink-0 rounded-full px-2 text-[10px]">
              {FOLLOWUP_ROTULO[f.tipo] ?? f.tipo}
            </Badge>

            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {f.nome ?? fmtTelefone(f.telefone)}
            </span>

            <span className="shrink-0 text-[11px] text-muted-foreground" suppressHydrationWarning>
              {dataHoraCompleta(f.agendadoPara)}
              {f.vencido && (
                <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">vencido</span>
              )}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <UserRound className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate">{f.atendenteNome ?? "Sem atendente responsável"}</span>
            <span className="ml-auto shrink-0">Ver detalhes</span>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{f.nome ?? "Lead sem nome"}</DialogTitle>
          <DialogDescription>
            {fmtTelefone(f.telefone)} · followup {FOLLOWUP_ROTULO[f.tipo] ?? f.tipo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={cn("rounded-full", STATUS_ESTILO[f.status])}>
              {f.status}
            </Badge>
            <Badge variant="secondary" className="rounded-full">
              {f.etiqueta}
            </Badge>
            {f.temperatura && (
              <Badge variant="outline" className="rounded-full capitalize">
                {f.temperatura}
              </Badge>
            )}
          </div>

          <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
              Mensagem programada
            </h4>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed">
              {f.textoSugerido ?? f.textoEnviado ?? "A mensagem ainda não foi redigida."}
            </p>
            {f.sugeridoEm && (
              <p className="mt-2 text-xs text-muted-foreground">
                Redigida em {dataHoraCompleta(f.sugeridoEm)}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Por que este followup foi criado
            </h4>
            <p className="rounded-xl border border-border p-3 leading-relaxed">
              {f.motivo || "Motivo não informado pela automação."}
            </p>
            {f.resumo && (
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">Resumo do lead no CRM</p>
                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{f.resumo}</p>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetalheFollowup
              titulo="Atendente responsável"
              valor={f.atendenteNome ?? "Sem responsável"}
            />
            <DetalheFollowup titulo="Programado para" valor={dataHoraCompleta(f.agendadoPara)} />
            <DetalheFollowup titulo="Criado em" valor={dataHoraCompleta(f.criadoEm)} />
            <DetalheFollowup titulo="Última atualização" valor={dataHoraCompleta(f.atualizadoEm)} />
            <DetalheFollowup titulo="Interesse" valor={f.interesse} />
            <DetalheFollowup titulo="Objeção" valor={f.objecao} />
            <DetalheFollowup titulo="Origem" valor={f.origem} />
            <DetalheFollowup titulo="Toques sem resposta" valor={String(f.nToques)} />
            <DetalheFollowup
              titulo="Aula agendada"
              valor={f.dataAgendada ? dataHoraCompleta(f.dataAgendada) : null}
            />
            <DetalheFollowup
              titulo="Última mensagem do lead"
              valor={f.ultimaMsgLeadEm ? dataHoraCompleta(f.ultimaMsgLeadEm) : null}
            />
            <DetalheFollowup
              titulo="Última mensagem da equipe"
              valor={f.ultimaMsgEquipeEm ? dataHoraCompleta(f.ultimaMsgEquipeEm) : null}
            />
            <DetalheFollowup
              titulo="Envio confirmado"
              valor={f.enviadoEm ? dataHoraCompleta(f.enviadoEm) : null}
            />
          </div>

          {f.motivoCancelamento && (
            <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <h4 className="text-xs font-semibold text-destructive">
                {f.status === "abortado" ? "Barrado pelo Porteiro" : "Motivo do cancelamento"}
              </h4>
              <p className="mt-1.5 leading-relaxed">{f.motivoCancelamento}</p>
            </section>
          )}

          <Link
            to="/"
            search={{ lead: f.leadId }}
            className="inline-flex text-sm font-medium text-primary hover:underline"
          >
            Abrir conversa completa do lead
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetalheFollowup({ titulo, valor }: { titulo: string; valor: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-0.5 leading-relaxed">{valor || "Não informado"}</p>
    </div>
  );
}

// ---------------------------------------------------------------- comuns

function Vazio({
  icone: Icone,
  titulo,
  detalhe,
}: {
  icone: React.ComponentType<{ className?: string }>;
  titulo: string;
  detalhe: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <Icone className="mx-auto h-8 w-8 text-muted-foreground/40" />
      <h3 className="mt-3 text-sm font-semibold">{titulo}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
        {detalhe}
      </p>
    </div>
  );
}

function ErroDeConexao({ error }: ErrorComponentProps) {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <CircleHelp className="mx-auto h-8 w-8 text-destructive" />
        <h2 className="mt-3 font-display text-base font-semibold">Não deu para ler o motor</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Se a mensagem fala em permissão, as views do WF-02 não foram liberadas para a role do
          painel. Rode <code className="font-mono">bun run db:apply</code>.
        </p>
      </div>
    </div>
  );
}
