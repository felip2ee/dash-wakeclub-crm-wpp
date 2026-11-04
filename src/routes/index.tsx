import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import {
  AlarmClock,
  ArrowLeft,
  BellOff,
  Bot,
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  Eye,
  MessageSquareText,
  PanelRight,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  dataHora,
  desde,
  diaRelativo,
  hora,
  iniciais,
  plural,
  telefone as fmtTelefone,
} from "@/lib/formato";
import { cn } from "@/lib/utils";
import {
  getConversas,
  getMensagens,
  type Conversa,
  type Direcao,
  type Mensagem,
} from "@/server/conversas";
import { exigirAdmin } from "@/server/auth";

/**
 * Caixa de entrada — ESPELHO, só leitura.
 *
 * A equipe responde pelo WhatsApp, não por aqui. O painel existe para LER o que
 * foi conversado (e para ver o que a IA entendeu daquilo). Não há campo de
 * digitação de propósito: mandar mensagem por este painel exigiria escrita no
 * banco e uma chamada à Evolution, e as duas coisas são o WF-03, não o painel.
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

type Filtro = "todas" | "aguardando" | "followup";

export const Route = createFileRoute("/")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({
    meta: [
      { title: "Conversas — Wake Club CRM" },
      {
        name: "description",
        content: "O que foi conversado com cada lead da Wake Club, espelhado do WhatsApp.",
      },
    ],
  }),
  // O lead selecionado vive na URL: recarregar a página não perde a conversa,
  // e dá pra mandar o link de um atendimento específico pra alguém.
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({
    lead: typeof search.lead === "string" ? search.lead : undefined,
  }),
  loader: (): Promise<Conversa[]> => getConversas(),
  errorComponent: ErroDeConexao,
  component: InboxPage,
});

function InboxPage() {
  const conversas = Route.useLoaderData();
  const { lead: leadSelecionado } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const router = useRouter();

  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);

  useEffect(() => {
    const t = setInterval(() => void router.invalidate(), RECARREGAR_A_CADA_MS);
    return () => clearInterval(t);
  }, [router]);

  const lista = useMemo(() => {
    let r = conversas;
    if (filtro === "aguardando") r = r.filter((c) => c.aguardandoEquipe && !c.optOut);
    if (filtro === "followup") r = r.filter((c) => c.followupEm !== null);

    const termo = busca.trim().toLowerCase();
    if (termo) {
      r = r.filter(
        (c) =>
          c.nome?.toLowerCase().includes(termo) ||
          c.telefone.includes(termo) ||
          c.ultimaTexto?.toLowerCase().includes(termo) ||
          c.interesse?.toLowerCase().includes(termo),
      );
    }
    return r;
  }, [conversas, filtro, busca]);

  const ativa = conversas.find((c) => c.id === leadSelecionado) ?? null;
  const aguardando = conversas.filter((c) => c.aguardandoEquipe && !c.optOut).length;

  const selecionar = (id: string) => void navigate({ search: { lead: id }, resetScroll: false });

  if (conversas.length === 0) return <SemConversas />;

  return (
    <div className="grid h-[calc(100dvh-3.5rem)] grid-cols-1 md:grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr_320px]">
      {/* ---------------------------------------------------------- lista */}
      <aside
        className={cn(
          "flex-col border-r border-border bg-card md:flex",
          ativa ? "hidden md:flex" : "flex",
        )}
      >
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between pb-3">
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold">Conversas</h1>
              <p className="text-[11px] text-muted-foreground">
                {plural(lista.length, "conversa", "conversas")}
                {aguardando > 0 && ` · ${aguardando} aguardando`}
              </p>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 gap-1 rounded-full text-[10px] font-normal text-muted-foreground"
            >
              <Eye className="h-3 w-3" /> espelho
            </Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome, telefone ou texto"
              className="h-9 bg-background pl-8 text-sm"
            />
          </div>
          <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)} className="pt-3">
            <TabsList className="grid w-full grid-cols-3 bg-muted">
              <TabsTrigger value="todas" className="text-xs">
                Todas
              </TabsTrigger>
              <TabsTrigger value="aguardando" className="text-xs">
                Aguardando
              </TabsTrigger>
              <TabsTrigger value="followup" className="text-xs">
                Com followup
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className="flex-1">
          {lista.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              Nenhuma conversa com esse filtro.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lista.map((c) => (
                <li key={c.id}>
                  <ItemDaLista
                    conversa={c}
                    ativa={c.id === leadSelecionado}
                    onSelect={() => selecionar(c.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </aside>

      {/* ----------------------------------------------------------- chat */}
      <section
        className={cn(
          "min-w-0 flex-col bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklab,var(--color-primary)_6%,transparent),transparent_40%),radial-gradient(circle_at_100%_100%,color-mix(in_oklab,var(--color-info)_5%,transparent),transparent_40%)] md:flex",
          ativa ? "flex" : "hidden md:flex",
        )}
      >
        {ativa ? (
          <Thread
            conversa={ativa}
            onVoltar={() => void navigate({ search: {}, resetScroll: false })}
            onAbrirDetalhes={() => setDetalhesAbertos(true)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div className="max-w-xs">
              <MessageSquareText className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Escolha uma conversa à esquerda para ler o histórico.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------------- painel do lead */}
      <aside className="hidden flex-col border-l border-border bg-card xl:flex">
        {ativa && (
          <ScrollArea className="flex-1">
            <DetalhesDoLead conversa={ativa} />
          </ScrollArea>
        )}
      </aside>

      <Sheet open={detalhesAbertos} onOpenChange={setDetalhesAbertos}>
        <SheetContent side="right" className="w-[min(92vw,380px)] overflow-y-auto p-0">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>Ficha do lead</SheetTitle>
          </SheetHeader>
          {ativa && <DetalhesDoLead conversa={ativa} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- lista

function ItemDaLista({
  conversa: c,
  ativa,
  onSelect,
}: {
  conversa: Conversa;
  ativa: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full px-3 py-3 text-left transition-colors hover:bg-muted/60",
        ativa && "bg-accent/70",
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11 shrink-0 ring-2 ring-background">
          <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary/40 text-sm font-semibold text-primary-foreground">
            {iniciais(c.nome)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {c.nome ?? fmtTelefone(c.telefone)}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground" suppressHydrationWarning>
              {c.ultimaEnviadaEm ? dataHora(c.ultimaEnviadaEm) : ""}
            </span>
          </div>

          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {c.ultimaTexto ? (
              <>
                {c.ultimaDirecao === "equipe" && <span className="text-foreground/60">você: </span>}
                {c.ultimaDirecao === "ia" && <span className="text-amber-600">IA: </span>}
                {c.ultimaTexto}
              </>
            ) : (
              <span className="italic">sem mensagens</span>
            )}
          </p>

          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="truncate rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
              {c.etiqueta}
            </span>
            {c.temperatura && (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 text-[10px] capitalize",
                  TEMPERATURA_ESTILO[c.temperatura],
                )}
              >
                {c.temperatura}
              </span>
            )}
            {c.optOut && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
            {c.msgsLeadSemResposta > 0 && (
              <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {c.msgsLeadSemResposta}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------- thread

function Thread({
  conversa: c,
  onVoltar,
  onAbrirDetalhes,
}: {
  conversa: Conversa;
  onVoltar: () => void;
  onAbrirDetalhes: () => void;
}) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["mensagens", c.id],
    queryFn: () => getMensagens({ data: { leadId: c.id } }),
    refetchInterval: RECARREGAR_A_CADA_MS,
  });

  return (
    <>
      <header className="flex h-14 items-center justify-between gap-2 border-b border-border bg-card/80 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 md:hidden"
            onClick={onVoltar}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary/40 text-xs font-semibold text-primary-foreground">
              {iniciais(c.nome)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{c.nome ?? "Sem nome"}</span>
              <Badge
                variant="outline"
                className="hidden h-5 shrink-0 px-1.5 text-[10px] font-normal sm:inline-flex"
              >
                {c.etiqueta}
              </Badge>
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {fmtTelefone(c.telefone)} · {plural(c.totalMensagens, "mensagem", "mensagens")}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 xl:hidden"
          onClick={onAbrirDetalhes}
          aria-label="Ficha do lead"
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-3 py-4 sm:px-6 sm:py-6">
          {isPending && (
            <p className="py-10 text-center text-xs text-muted-foreground">
              carregando a conversa…
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
          {data?.map((m, i) => (
            <Bolha key={m.id} mensagem={m} anterior={data[i - 1]} />
          ))}
        </div>
      </ScrollArea>

      {/* No lugar do campo de digitação. O painel não envia — ver o topo. */}
      <div className="border-t border-border bg-card/70 px-3 py-2.5 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          <span>Painel é espelho — para responder, use o WhatsApp da equipe.</span>
        </div>
      </div>
    </>
  );
}

function Bolha({ mensagem: m, anterior }: { mensagem: Mensagem; anterior?: Mensagem }) {
  const daEquipe = m.direcao !== "lead";
  const daIa = m.direcao === "ia";

  const novoDia =
    !anterior ||
    new Date(m.enviadaEm).toDateString() !== new Date(anterior.enviadaEm).toDateString();

  return (
    <>
      {novoDia && (
        <div
          className="mx-auto my-2 rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground"
          suppressHydrationWarning
        >
          {diaRelativo(m.enviadaEm)}
        </div>
      )}

      <div className={cn("flex", daEquipe ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[75%]",
            !daEquipe && "rounded-bl-sm bg-card text-card-foreground",
            daEquipe && !daIa && "rounded-br-sm bg-primary text-primary-foreground",
            // A IA é visualmente distinta do atendente de propósito: quem lê
            // precisa saber, sem esforço, que aquilo saiu automático.
            daIa && "rounded-br-sm border border-amber-500/40 bg-amber-500/10 text-foreground",
          )}
        >
          {daIa && (
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              <Bot className="h-3 w-3" /> followup automático
            </div>
          )}

          <p className="whitespace-pre-wrap leading-relaxed">
            {m.texto ?? <span className="italic opacity-60">(sem texto)</span>}
          </p>

          <div
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[10px]",
              daEquipe && !daIa ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
            suppressHydrationWarning
          >
            <span>{hora(m.enviadaEm)}</span>
            {daEquipe && <Entrega nivel={m.entregaNivel} />}
          </div>
        </div>
      </div>
    </>
  );
}

/** 0 erro · 1 pendente · 2 servidor · 3 entregue · 4 lido · 5 reproduzido */
function Entrega({ nivel }: { nivel: number | null }) {
  if (nivel === null) return null;
  if (nivel === 0) return <TriangleAlert className="h-3 w-3 text-destructive" />;
  if (nivel <= 2) return <Check className="h-3 w-3" />;
  if (nivel === 3) return <CheckCheck className="h-3 w-3" />;
  return <CheckCheck className="h-3 w-3 text-info" />;
}

// -------------------------------------------------------- ficha do lead

function DetalhesDoLead({ conversa: c }: { conversa: Conversa }) {
  const atrasado = (c.horasEsperando ?? 0) >= 4;

  return (
    <div className="p-4">
      <div className="flex flex-col items-center pb-4 text-center">
        <Avatar className="h-16 w-16 ring-4 ring-primary/20">
          <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary/40 text-lg font-semibold text-primary-foreground">
            {iniciais(c.nome)}
          </AvatarFallback>
        </Avatar>
        <h3 className="mt-3 font-display text-base font-semibold">{c.nome ?? "Sem nome"}</h3>
        <p className="text-xs text-muted-foreground">{fmtTelefone(c.telefone)}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {c.etiqueta}
          </Badge>
          {c.temperatura && (
            <Badge
              variant="outline"
              className={cn(
                "rounded-full text-[10px] capitalize",
                TEMPERATURA_ESTILO[c.temperatura],
              )}
            >
              {c.temperatura}
            </Badge>
          )}
          {c.optOut && (
            <Badge variant="outline" className="gap-1 rounded-full text-[10px]">
              <BellOff className="h-2.5 w-2.5" /> opt-out
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
            <Clock className="h-3 w-3" /> Aguardando a equipe
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

      <div className="space-y-2 text-sm">
        {/* Tudo daqui pra baixo foi preenchido pela IA (WF-02), não por humano. */}
        <Campo rotulo="Origem" valor={c.origem} />
        <Campo rotulo="Interesse" valor={c.interesse} />
        <Campo rotulo="Objeção" valor={c.objecao} destaque />

        {c.dataAgendada && (
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3 w-3" /> Aula agendada
            </div>
            <div className="text-sm font-medium" suppressHydrationWarning>
              {dataHora(c.dataAgendada)}
            </div>
          </div>
        )}

        {c.resumo && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3 w-3" /> Resumo da IA
            </div>
            <p className="text-xs leading-relaxed text-foreground/80">{c.resumo}</p>
          </div>
        )}

        {c.followupEm && c.followupTipo && (
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlarmClock className="h-3 w-3" /> Followup programado
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

// -------------------------------------------------------------- vazios

function SemConversas() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <MessageSquareText className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h2 className="mt-3 font-display text-base font-semibold">Nenhuma conversa no banco</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O painel conectou, mas a tabela de leads está vazia. Isso normalmente significa que o
          WF-01 não está recebendo webhook da Evolution.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Rode <code className="font-mono">bun run db:check</code> para ver a contagem real de
          linhas de cada tabela.
        </p>
      </div>
    </div>
  );
}

function ErroDeConexao({ error }: ErrorComponentProps) {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <TriangleAlert className="mx-auto h-8 w-8 text-destructive" />
        <h2 className="mt-3 font-display text-base font-semibold">Não deu para ler as conversas</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Se a mensagem fala em permissão, falta o GRANT das views novas. Rode{" "}
          <code className="font-mono">bun run db:apply</code> e depois{" "}
          <code className="font-mono">bun run db:check</code>.
        </p>
      </div>
    </div>
  );
}
