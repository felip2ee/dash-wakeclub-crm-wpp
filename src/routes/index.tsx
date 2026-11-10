import {
  createFileRoute,
  useNavigate,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { MessageSquareText, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Conversa } from "@/features/conversa/Conversa";
import { DetalhesDoLead } from "@/features/conversa/DetalhesDoLead";
import { leadSemConversa } from "@/components/shell/navegacao";
import { ListaConversas } from "@/features/conversas-lista/ListaConversas";
import { cn } from "@/lib/utils";
import { getConversas, getMensagens, type Conversa as LinhaConversa } from "@/server/conversas";
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
  loader: (): Promise<LinhaConversa[]> => getConversas(),
  errorComponent: ErroDeConexao,
  component: InboxPage,
});

function InboxPage() {
  const conversas = Route.useLoaderData();
  const { lead: leadSelecionado } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const router = useRouter();

  useEffect(() => {
    // Aba em segundo plano não recarrega a lista inteira à toa.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void router.invalidate();
    }, RECARREGAR_A_CADA_MS);
    return () => clearInterval(t);
  }, [router]);

  const ativa = conversas.find((c) => c.id === leadSelecionado) ?? null;
  const semConversa = leadSemConversa(leadSelecionado, ativa !== null);
  useEffect(() => {
    if (semConversa) void navigate({ search: {}, replace: true });
  }, [semConversa, navigate]);

  if (conversas.length === 0) return <SemConversas />;

  return (
    <div
      className={cn(
        "grid grid-cols-1 md:h-[calc(100dvh-var(--cabecalho))] md:grid-cols-[340px_1fr] xl:grid-cols-[360px_1fr_320px]",
        // Conversa aberta no celular ocupa a tela inteira (o AppShell esconde cabeçalho e barra).
        leadSelecionado ? "h-dvh" : "altura-tela-sob-barra",
      )}
    >
      <aside
        className={cn(
          "min-h-0 flex-col border-r border-border md:flex",
          ativa ? "hidden md:flex" : "flex",
        )}
      >
        <ListaConversas
          itens={conversas}
          selecionado={leadSelecionado}
          onSelecionar={(id) => void navigate({ search: { lead: id }, resetScroll: false })}
        />
      </aside>

      <section
        className={cn("min-h-0 min-w-0 flex-col md:flex", ativa ? "flex" : "hidden md:flex")}
      >
        {ativa ? (
          <Conversa
            key={ativa.id}
            lead={ativa}
            queryKey={["mensagens", ativa.id]}
            carregar={(limite) => getMensagens({ data: { leadId: ativa.id, limite } })}
            onVoltar={() => void navigate({ search: {}, resetScroll: false })}
            voltarNoDesktop={false}
            ficha={<DetalhesDoLead conversa={ativa} />}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div className="max-w-xs">
              <MessageSquareText
                aria-hidden
                className="mx-auto h-10 w-10 text-muted-foreground/40"
              />
              <p className="mt-3 text-sm text-muted-foreground">
                Escolha uma conversa à esquerda para ler o histórico.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Ficha fixa só no desktop largo; nos outros tamanhos ela abre pelo menu ⋮. */}
      <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-card xl:block">
        {ativa && <DetalhesDoLead conversa={ativa} />}
      </aside>
    </div>
  );
}

// -------------------------------------------------------------- vazios

function SemConversas() {
  return (
    <div className="flex altura-tela-com-barra md:h-[calc(100dvh-var(--cabecalho))] items-center justify-center p-6">
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
    <div className="flex altura-tela-com-barra md:h-[calc(100dvh-var(--cabecalho))] items-center justify-center p-6">
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
