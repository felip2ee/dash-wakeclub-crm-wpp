import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCheck,
  Clock3,
  Copy,
  Flame,
  Info,
  ListTodo,
  MessageCircle,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  organizarMinhaFila,
  type ItemMinhaFila,
  type SecaoMinhaFila,
} from "@/features/minha-fila/fila";
import { dataHora, desde, plural } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirAtendente } from "@/server/auth";
import {
  listarFilaOperacional,
  registrarToque,
  type LeadFilaOperacional,
} from "@/server/followups";

const CHAVE_FILA = ["minha-fila-operacional"] as const;

const SECOES: Array<{
  chave: SecaoMinhaFila;
  titulo: string;
  descricao: string;
  vazio: string;
  icone: typeof Clock3;
}> = [
  {
    chave: "agora",
    titulo: "Precisa de você agora",
    descricao: "Em ordem de prioridade",
    vazio: "Nada exige sua ação neste momento.",
    icone: Clock3,
  },
  {
    chave: "esperando",
    titulo: "Esperando resposta",
    descricao: "O próximo passo depende do lead",
    vazio: "Nenhum lead esperando resposta.",
    icone: UserRoundCheck,
  },
  {
    chave: "depois",
    titulo: "Mais tarde",
    descricao: "Retornos já programados",
    vazio: "Nenhum retorno programado.",
    icone: CalendarClock,
  },
  {
    chave: "feitos",
    titulo: "Feitos hoje",
    descricao: "WhatsApps que você abriu hoje",
    vazio: "Nenhuma ação registrada hoje.",
    icone: CheckCheck,
  },
];

export const Route = createFileRoute("/minha-fila")({
  beforeLoad: () => exigirAtendente(),
  loader: () => listarFilaOperacional(),
  head: () => ({ meta: [{ title: "Minha fila — Wake Club" }] }),
  component: MinhaFilaPage,
});

function MinhaFilaPage() {
  const inicial = Route.useLoaderData();
  const clienteQuery = useQueryClient();
  const { data: leads = inicial } = useQuery({
    queryKey: CHAVE_FILA,
    queryFn: () => listarFilaOperacional(),
    initialData: inicial,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const fila = organizarMinhaFila(leads);

  function abrirNoWhatsApp(item: ItemMinhaFila) {
    const followup = item.aguardandoEquipe ? null : item.followup;
    const numero = item.telefone.replace(/\D/g, "");
    const texto = followup?.textoSugerido;
    const url = `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;

    if (followup) {
      clienteQuery.setQueryData<LeadFilaOperacional[]>(CHAVE_FILA, (atual) =>
        atual?.map((lead) =>
          lead.leadId === item.leadId && lead.followup
            ? {
                ...lead,
                followup: {
                  ...lead.followup,
                  jaTocado: true,
                  toques: lead.followup.toques + 1,
                  ultimoToqueEm: new Date().toISOString(),
                },
              }
            : lead,
        ),
      );

      // Sem await: o vínculo com o gesto precisa sobreviver no iOS instalado.
      void registrarToque({ data: { followupId: followup.followupId } });
    }

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
      <header className="mb-6 rounded-3xl bg-primary px-5 py-5 text-primary-foreground shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">
          Sua operação
        </p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Minha fila</h1>
            <p className="mt-1 text-sm text-primary-foreground/75">
              Comece pelo primeiro card. A ordem já considera urgência e próximo passo.
            </p>
          </div>
          <Badge className="shrink-0 border-white/20 bg-white/15 text-white hover:bg-white/15">
            {plural(fila.agora.length, "agora", "agora")}
          </Badge>
        </div>
      </header>

      <div className="space-y-8">
        {SECOES.map((secao) => (
          <Secao
            key={secao.chave}
            {...secao}
            itens={fila[secao.chave]}
            onAbrir={abrirNoWhatsApp}
            onCopiar={copiar}
          />
        ))}
      </div>
    </div>
  );
}

function Secao({
  titulo,
  descricao,
  vazio,
  icone: Icone,
  itens,
  onAbrir,
  onCopiar,
}: {
  chave: SecaoMinhaFila;
  titulo: string;
  descricao: string;
  vazio: string;
  icone: typeof Clock3;
  itens: ItemMinhaFila[];
  onAbrir: (item: ItemMinhaFila) => void;
  onCopiar: (texto: string) => Promise<void>;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 px-1">
        <Icone className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
        <Badge variant="secondary" className="rounded-full">
          {itens.length}
        </Badge>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <ListTodo className="mx-auto mb-2 h-7 w-7 opacity-35" />
          {vazio}
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map((item) => (
            <FilaCard key={item.leadId} item={item} onAbrir={onAbrir} onCopiar={onCopiar} />
          ))}
        </div>
      )}
    </section>
  );
}

function FilaCard({
  item,
  onAbrir,
  onCopiar,
}: {
  item: ItemMinhaFila;
  onAbrir: (item: ItemMinhaFila) => void;
  onCopiar: (texto: string) => Promise<void>;
}) {
  const sugestaoUtilizavel = item.followup && !item.aguardandoEquipe;
  const podeAgir = item.secao === "agora";

  return (
    <Card className={cn("overflow-hidden", podeAgir && "border-primary/35 shadow-sm")}>
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold">
              {item.nome ?? "Lead sem nome"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
              {item.ultimaMsgLeadEm
                ? `Lead falou ${desde(item.ultimaMsgLeadEm)}`
                : "Sem mensagem recente"}
              {item.nToques > 0 && ` · ${item.nToques}º toque`}
            </p>
          </div>
          <div className="flex max-w-[48%] flex-wrap justify-end gap-1.5">
            {item.temperatura === "quente" && (
              <Badge className="gap-1 rounded-full bg-orange-500/15 text-orange-700 hover:bg-orange-500/15 dark:text-orange-300">
                <Flame className="h-3 w-3" /> Quente
              </Badge>
            )}
            <Badge variant="outline" className="max-w-full truncate rounded-full font-normal">
              {item.etiqueta}
            </Badge>
          </div>
        </div>

        {item.followup && item.secao === "depois" && (
          <p className="flex items-center gap-1 text-xs font-medium text-primary">
            <CalendarClock className="h-3.5 w-3.5" /> {dataHora(item.followup.agendadoPara)}
          </p>
        )}
        {item.followup?.jaTocado && item.secao === "feitos" && (
          <p
            className={cn(
              "flex items-center gap-1 text-xs",
              item.followup.temEco ? "text-primary" : "text-amber-700 dark:text-amber-400",
            )}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {item.followup.temEco ? "Mensagem confirmada" : "Aberto, sem envio confirmado"}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {item.resumo && <p className="line-clamp-2 text-sm text-muted-foreground">{item.resumo}</p>}

        <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Info className="h-3.5 w-3.5 text-primary" /> Por que estou te mostrando isso?
          </p>
          <p className="mt-1.5 leading-relaxed text-muted-foreground">{item.explicacao}</p>
        </div>

        {sugestaoUtilizavel && (
          <div>
            <p className="mb-1.5 text-xs font-semibold">Sugestão</p>
            <blockquote className="whitespace-pre-wrap rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm leading-relaxed">
              {sugestaoUtilizavel.textoSugerido}
            </blockquote>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2 border-t bg-muted/20 pt-4">
        {podeAgir && (
          <Button className="h-11 flex-1" onClick={() => onAbrir(item)}>
            <MessageCircle />
            {sugestaoUtilizavel ? "Abrir no WhatsApp" : "Responder no WhatsApp"}
          </Button>
        )}
        {podeAgir && sugestaoUtilizavel && (
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            aria-label="Copiar sugestão"
            onClick={() => void onCopiar(sugestaoUtilizavel.textoSugerido)}
          >
            <Copy />
          </Button>
        )}
        <Button variant="outline" className={cn("h-11", !podeAgir && "w-full")} asChild>
          <Link to="/meus-leads" search={{ lead: item.leadId }}>
            Ver contexto
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
