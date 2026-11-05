import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { rotaInicial } from "@/components/shell/navegacao";
import { Conversa } from "@/features/conversa/Conversa";
import { ListaConversas } from "@/features/conversas-lista/ListaConversas";
import { telefone } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirSessao } from "@/server/auth";
import { listarMensagensDoMeuLead, listarMeusLeads, type MeuLead } from "@/server/meus-leads";

export const Route = createFileRoute("/meus-leads")({
  validateSearch: z.object({ lead: z.string().uuid().optional() }),
  beforeLoad: async () => {
    const sessao = await exigirSessao();
    if (sessao.papel === "admin") throw redirect({ to: rotaInicial("admin") });
    return { sessao };
  },
  loader: () => listarMeusLeads(),
  head: () => ({ meta: [{ title: "Conversas — Wake Club" }] }),
  component: MeusLeadsPage,
});

function MeusLeadsPage() {
  const leads = Route.useLoaderData();
  const navigate = useNavigate();
  const { lead: leadId } = Route.useSearch();
  const selecionado = leads.find((lead) => lead.id === leadId) ?? null;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-3xl md:h-[calc(100dvh-3.5rem)]",
        // Conversa aberta no celular ocupa a tela inteira (o AppShell esconde cabeçalho e barra).
        leadId ? "h-dvh" : "altura-tela-com-barra",
      )}
    >
      {selecionado ? (
        <Conversa
          key={selecionado.id}
          lead={selecionado}
          queryKey={["mensagens-meu-lead", selecionado.id]}
          carregar={() => listarMensagensDoMeuLead({ data: { leadId: selecionado.id } })}
          onVoltar={() => void navigate({ to: "/meus-leads", search: {} })}
          ficha={<Ficha lead={selecionado} />}
        />
      ) : (
        <ListaConversas
          itens={leads}
          onSelecionar={(id) => void navigate({ to: "/meus-leads", search: { lead: id } })}
        />
      )}
    </div>
  );
}

function Ficha({ lead }: { lead: MeuLead }) {
  return (
    <dl className="space-y-3 p-4 text-sm">
      <div>
        <dt className="text-xs text-muted-foreground">Telefone</dt>
        <dd className="font-medium">{telefone(lead.telefone)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Etapa</dt>
        <dd className="font-medium">{lead.etiqueta}</dd>
      </div>
      {lead.resumo && (
        <div>
          <dt className="text-xs text-muted-foreground">Resumo da IA</dt>
          <dd className="leading-relaxed">{lead.resumo}</dd>
        </div>
      )}
    </dl>
  );
}
