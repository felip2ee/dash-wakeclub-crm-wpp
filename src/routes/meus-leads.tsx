import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock3, MessageCircle, Search, UsersRound } from "lucide-react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { desde, hora, plural, telefone } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirSessao } from "@/server/auth";
import { listarMensagensDoMeuLead, listarMeusLeads, type MeuLead } from "@/server/meus-leads";

export const Route = createFileRoute("/meus-leads")({
  validateSearch: z.object({ lead: z.string().uuid().optional() }),
  beforeLoad: async () => {
    const sessao = await exigirSessao();
    if (sessao.papel === "admin") throw redirect({ to: "/kanban" });
    return { sessao };
  },
  loader: () => listarMeusLeads(),
  head: () => ({ meta: [{ title: "Meus leads — Wake Club" }] }),
  component: MeusLeadsPage,
});

function MeusLeadsPage() {
  const leads = Route.useLoaderData();
  const navigate = useNavigate();
  const { lead: leadId } = Route.useSearch();
  const [busca, setBusca] = useState("");
  const selecionado = leads.find((lead) => lead.id === leadId) ?? null;

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR").replace(/\D/g, "");
    const texto = busca.trim().toLocaleLowerCase("pt-BR");
    if (!texto) return leads;
    return leads.filter(
      (lead) =>
        lead.nome?.toLocaleLowerCase("pt-BR").includes(texto) ||
        (termo.length > 0 && lead.telefone.replace(/\D/g, "").includes(termo)),
    );
  }, [busca, leads]);

  if (selecionado) {
    return (
      <Conversa
        lead={selecionado}
        voltar={() => void navigate({ to: "/meus-leads", search: {} })}
      />
    );
  }

  const grupos = Array.from(
    filtrados.reduce((mapa, lead) => {
      const grupo = mapa.get(lead.etiqueta) ?? { ordem: lead.etiquetaOrdem, leads: [] };
      grupo.leads.push(lead);
      mapa.set(lead.etiqueta, grupo);
      return mapa;
    }, new Map<string, { ordem: number; leads: MeuLead[] }>()),
  ).sort((a, b) => a[1].ordem - b[1].ordem);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <header className="mb-5 px-1">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Sua carteira</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold">Meus leads</h1>
          <Badge variant="secondary" className="rounded-full">
            {plural(leads.length, "lead", "leads")}
          </Badge>
        </div>
      </header>

      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="h-10 pl-9"
          inputMode="search"
        />
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <UsersRound className="mx-auto mb-2 h-8 w-8 opacity-40" />
          {busca ? "Nenhum lead encontrado." : "Nenhum lead atribuído a você."}
        </div>
      ) : (
        <div className="space-y-7">
          {grupos.map(([etiqueta, grupo]) => (
            <section key={etiqueta}>
              <div className="mb-3 flex items-center gap-2 px-1">
                <h2 className="text-sm font-semibold">{etiqueta}</h2>
                <Badge variant="outline" className="rounded-full font-normal">
                  {grupo.leads.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {grupo.leads.map((lead) => (
                  <button
                    key={lead.id}
                    className="block w-full text-left"
                    onClick={() => void navigate({ to: "/meus-leads", search: { lead: lead.id } })}
                  >
                    <Card className="transition-colors hover:border-primary/40 active:bg-muted/50">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-medium">{lead.nome ?? "Lead sem nome"}</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {telefone(lead.telefone)}
                            </p>
                          </div>
                          {lead.aguardandoEquipe && (
                            <Badge className="shrink-0 rounded-full">Aguardando</Badge>
                          )}
                        </div>
                        {lead.resumo && (
                          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                            {lead.resumo}
                          </p>
                        )}
                        <p
                          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"
                          suppressHydrationWarning
                        >
                          <Clock3 className="h-3.5 w-3.5" />
                          {lead.ultimaMsgEm
                            ? `Última mensagem ${desde(lead.ultimaMsgEm)}`
                            : "Sem mensagens"}
                        </p>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Conversa({ lead, voltar }: { lead: MeuLead; voltar: () => void }) {
  const { data: mensagens = [], isLoading } = useQuery({
    queryKey: ["mensagens-meu-lead", lead.id],
    queryFn: () => listarMensagensDoMeuLead({ data: { leadId: lead.id } }),
  });

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col px-3 py-4 sm:px-6">
      <header className="sticky top-0 z-10 -mx-3 flex items-center gap-3 border-b bg-background/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button variant="ghost" size="icon" onClick={voltar} aria-label="Voltar para meus leads">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{lead.nome ?? "Lead sem nome"}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {telefone(lead.telefone)} · {lead.etiqueta}
          </p>
        </div>
        <MessageCircle className="h-5 w-5 text-primary" />
      </header>

      <div className="flex-1 space-y-3 py-5">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Carregando conversa…</p>
        ) : mensagens.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem encontrada.</p>
        ) : (
          mensagens.map((mensagem) => (
            <div
              key={mensagem.id}
              className={cn(
                "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                mensagem.direcao === "lead"
                  ? "mr-auto rounded-bl-md bg-muted"
                  : "ml-auto rounded-br-md bg-primary/10",
              )}
            >
              <p className="whitespace-pre-wrap break-words">
                {mensagem.texto || "Mensagem sem texto"}
              </p>
              <p
                className="mt-1 text-right text-[10px] text-muted-foreground"
                suppressHydrationWarning
              >
                {hora(mensagem.enviadaEm)}
              </p>
            </div>
          ))
        )}
      </div>
      <p className="border-t py-3 text-center text-xs text-muted-foreground">
        Somente leitura. Responda pelo WhatsApp.
      </p>
    </div>
  );
}
