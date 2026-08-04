import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCheck,
  ChevronDown,
  Clock3,
  Copy,
  Info,
  ListTodo,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { desde, hora, plural } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirSessao } from "@/server/auth";
import { listarMinhaFila, registrarToque, type FollowupFila } from "@/server/followups";

const CHAVE_FILA = ["minha-fila-followups"] as const;

export const Route = createFileRoute("/followups")({
  beforeLoad: async () => ({ sessao: await exigirSessao() }),
  loader: () => listarMinhaFila(),
  head: () => ({ meta: [{ title: "Followups — Wake Club" }] }),
  component: FollowupsPage,
});

function FollowupsPage() {
  const inicial = Route.useLoaderData();
  const clienteQuery = useQueryClient();
  const { data: fila = inicial } = useQuery({
    queryKey: CHAVE_FILA,
    queryFn: () => listarMinhaFila(),
    initialData: inicial,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const agora = fila.filter((item) => item.vencido && !item.jaTocado);
  const abertos = fila.filter((item) => item.jaTocado);
  const depois = fila.filter((item) => !item.vencido && !item.jaTocado);

  function abrirNoWhatsApp(followup: FollowupFila) {
    const numero = followup.telefone.replace(/\D/g, "");
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(followup.textoSugerido)}`;

    clienteQuery.setQueryData<FollowupFila[]>(CHAVE_FILA, (atual) =>
      atual?.map((item) =>
        item.followupId === followup.followupId
          ? {
              ...item,
              jaTocado: true,
              toques: item.toques + 1,
              ultimoToqueEm: new Date().toISOString(),
            }
          : item,
      ),
    );

    // Sem await: preservar o vínculo do gesto é mais importante que o log.
    void registrarToque({ data: { followupId: followup.followupId } });
    window.location.href = url;
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado.");
    } catch {
      toast.error("Não foi possível copiar o texto.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <header className="mb-5 flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Sua fila</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">Followups</h1>
        </div>
        <Badge variant={agora.length > 0 ? "default" : "secondary"} className="rounded-full">
          {plural(agora.length, "agora", "agora")}
        </Badge>
      </header>

      <Grupo
        titulo="Agora"
        descricao="Sugestões prontas e no horário de enviar"
        icone={Clock3}
        itens={agora}
        vazio="Nenhum followup esperando agora."
        onAbrir={abrirNoWhatsApp}
        onCopiar={copiar}
      />

      {abertos.length > 0 && (
        <details className="group mt-7">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-1 py-2 text-sm font-semibold">
            <CheckCheck className="h-4 w-4 text-primary" />
            Já abri
            <Badge variant="secondary" className="ml-1 rounded-full">
              {abertos.length}
            </Badge>
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-3">
            {abertos.map((item) => (
              <FollowupCard
                key={item.followupId}
                followup={item}
                onAbrir={abrirNoWhatsApp}
                onCopiar={copiar}
              />
            ))}
          </div>
        </details>
      )}

      {depois.length > 0 && (
        <Grupo
          className="mt-7"
          titulo="Depois"
          descricao="Programados para mais tarde"
          icone={CalendarClock}
          itens={depois}
          vazio=""
          onAbrir={abrirNoWhatsApp}
          onCopiar={copiar}
        />
      )}
    </div>
  );
}

function Grupo({
  titulo,
  descricao,
  icone: Icone,
  itens,
  vazio,
  onAbrir,
  onCopiar,
  className,
}: {
  titulo: string;
  descricao: string;
  icone: typeof Clock3;
  itens: FollowupFila[];
  vazio: string;
  onAbrir: (followup: FollowupFila) => void;
  onCopiar: (texto: string) => Promise<void>;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center gap-2 px-1">
        <Icone className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
      </div>
      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <ListTodo className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">{vazio}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map((item) => (
            <FollowupCard
              key={item.followupId}
              followup={item}
              onAbrir={onAbrir}
              onCopiar={onCopiar}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FollowupCard({
  followup,
  onAbrir,
  onCopiar,
}: {
  followup: FollowupFila;
  onAbrir: (followup: FollowupFila) => void;
  onCopiar: (texto: string) => Promise<void>;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden",
        followup.vencido && !followup.jaTocado && "border-primary/35 shadow-sm",
      )}
    >
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold">
              {followup.nome ?? "Lead sem nome"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
              {followup.ultimaMsgLeadEm
                ? `Lead falou ${desde(followup.ultimaMsgLeadEm)}`
                : "Sem mensagem recente"}
              {followup.nToques > 0 && ` · ${followup.nToques}º toque`}
            </p>
          </div>
          <Badge
            variant="outline"
            className="max-w-[45%] shrink-0 truncate rounded-full font-normal"
          >
            {followup.etiqueta}
          </Badge>
        </div>
        {!followup.vencido && (
          <p
            className="flex items-center gap-1 text-xs font-medium text-primary"
            suppressHydrationWarning
          >
            <CalendarClock className="h-3.5 w-3.5" /> Hoje às {hora(followup.agendadoPara)}
          </p>
        )}
        {followup.jaTocado && (
          <p
            className={cn(
              "flex items-center gap-1 text-xs",
              followup.temEco ? "text-primary" : "text-amber-700 dark:text-amber-400",
            )}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {followup.temEco ? "Mensagem confirmada" : "Aberto, sem envio confirmado ainda"}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {followup.motivo && (
          <div className="flex gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="leading-relaxed">{followup.motivo}</p>
          </div>
        )}
        <blockquote className="whitespace-pre-wrap rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground">
          {followup.textoSugerido}
        </blockquote>
      </CardContent>

      <CardFooter className="grid grid-cols-[1fr_auto] gap-2 border-t border-border bg-muted/20 pt-4">
        <Button className="h-11" onClick={() => onAbrir(followup)}>
          <MessageCircle /> Abrir no WhatsApp
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          aria-label="Copiar texto"
          onClick={() => void onCopiar(followup.textoSugerido)}
        >
          <Copy />
        </Button>
      </CardFooter>
    </Card>
  );
}
