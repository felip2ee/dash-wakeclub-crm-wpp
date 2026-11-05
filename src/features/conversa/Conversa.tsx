import { type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ChevronLeft,
  Eye,
  MessageCircle,
  MoreVertical,
  Send,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { telefone as fmtTelefone } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { getLinhaDoTempo } from "@/server/conversas";
import { envioDisponivel } from "@/server/envio";

import { Bolha, type MensagemConversa } from "./Bolha";
import { Composer } from "./Composer";
import { type ChipLinha, dataDoChip, montarLinhaDoTempo, rotuloDia } from "./linha-do-tempo";
import { SugestaoDaConversa } from "./SugestaoDaConversa";

const RECARREGAR_A_CADA_MS = 30_000;

const ICONE_CHIP: Record<ChipLinha["tipo"], typeof UserRound> = {
  cadastro: UserRound,
  etapa: ArrowLeftRight,
  followup: Send,
  compra: ShoppingCart,
};

// Conversa de um lead (referência 01, direita), usada em `/` (admin) e `/meus-leads`:
// cabeçalho, linha do tempo, bolhas com separador de dia, sugestão da IA e Composer.
export function Conversa({
  lead,
  queryKey,
  carregar,
  onVoltar,
  ficha,
  voltarNoDesktop = true,
}: {
  lead: { id: string; nome: string | null; telefone: string };
  queryKey: QueryKey;
  carregar: () => Promise<MensagemConversa[]>;
  onVoltar: () => void;
  /** Conteúdo do menu ⋮ (ficha do lead); sem ele o menu não aparece. */
  ficha?: ReactNode;
  /** `false` quando a lista fica ao lado (split do admin): voltar só no celular. */
  voltarNoDesktop?: boolean;
}) {
  const nome = lead.nome ?? fmtTelefone(lead.telefone);
  const router = useRouter();
  const cliente = useQueryClient();
  const [fichaAberta, setFichaAberta] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const mensagens = useQuery({
    queryKey,
    queryFn: carregar,
    refetchInterval: RECARREGAR_A_CADA_MS,
  });
  const linha = useQuery({
    queryKey: ["linha-do-tempo", lead.id],
    queryFn: () => getLinhaDoTempo({ data: { leadId: lead.id } }),
    refetchInterval: RECARREGAR_A_CADA_MS,
  });
  const { data: podeEnviar } = useQuery({
    queryKey: ["envio-disponivel"],
    queryFn: () => envioDisponivel(),
  });

  const chips = useMemo(
    () =>
      linha.data
        ? montarLinhaDoTempo(linha.data.criadoEm, linha.data.eventos, linha.data.compras)
        : [],
    [linha.data],
  );
  const lista = mensagens.data ?? [];

  // Abre (e acompanha) a conversa no fim, como no WhatsApp.
  useEffect(() => fim.current?.scrollIntoView({ block: "end" }), [lista.length]);

  // Lista de conversas (loader da rota e a contagem do AppShell): última mensagem,
  // contador e não lidas mudam quando sai/chega mensagem ou a sugestão é decidida.
  const atualizarLista = () => {
    void router.invalidate();
    void cliente.invalidateQueries({ queryKey: ["meus-leads"] });
  };
  // O Composer (fase 1) só invalida a própria thread; mudou o total, a lista recarrega.
  const total = useRef<number | null>(null);
  useEffect(() => {
    if (!mensagens.isSuccess) return;
    if (total.current !== null && total.current !== lista.length) atualizarLista();
    total.current = lista.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- atualizarLista é estável na prática (router/cliente)
  }, [mensagens.isSuccess, lista.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-14 items-center gap-2 border-b border-border bg-background/90 px-2 py-1.5 backdrop-blur">
        <button
          type="button"
          onClick={onVoltar}
          aria-label="Voltar para as conversas"
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !voltarNoDesktop && "md:hidden",
          )}
        >
          <ChevronLeft aria-hidden className="h-6 w-6" />
        </button>
        <AvatarIniciais nome={nome} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-tight">{nome}</h2>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MessageCircle aria-hidden className="h-3.5 w-3.5 text-primary" />
            WhatsApp · Lead
          </p>
        </div>
        {ficha && (
          <button
            type="button"
            onClick={() => setFichaAberta(true)}
            aria-label="Ficha do lead"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreVertical aria-hidden className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-3 py-4 sm:px-6">
          <LinhaDoTempoChips chips={chips} />
          {linha.isError && (
            <p role="alert" className="text-center text-xs text-destructive">
              Não deu para ler a linha do tempo: {linha.error.message}
            </p>
          )}

          {mensagens.isPending && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Carregando a conversa…
            </p>
          )}
          {mensagens.isError && (
            <p role="alert" className="py-10 text-center text-sm text-destructive">
              {mensagens.error.message}
            </p>
          )}
          {mensagens.isSuccess && lista.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Este lead ainda não tem mensagens registradas.
            </p>
          )}
          {lista.map((m, i) => {
            const dia = rotuloDia(m.enviadaEm);
            const novoDia = i === 0 || dia !== rotuloDia(lista[i - 1].enviadaEm);
            return (
              <Fragment key={m.id}>
                {novoDia && (
                  <div className="my-2 flex items-center gap-3" suppressHydrationWarning>
                    <span className="h-px flex-1 bg-border" />
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                      {dia}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <Bolha
                  mensagem={m}
                  audio={
                    linha.data && m.id in linha.data.audios ? linha.data.audios[m.id] : undefined
                  }
                  midia={linha.data?.midias[m.id]}
                />
              </Fragment>
            );
          })}
          <div ref={fim} />
        </div>
      </div>

      {linha.data?.sugestao && (
        <SugestaoDaConversa
          key={linha.data.sugestao.followupId}
          sugestao={linha.data.sugestao}
          onDecidido={() => {
            void cliente.invalidateQueries({ queryKey: ["linha-do-tempo", lead.id] });
            void cliente.invalidateQueries({ queryKey: ["aprovacao"] });
            atualizarLista();
          }}
        />
      )}

      {podeEnviar ? (
        <Composer leadId={lead.id} queryKey={queryKey} />
      ) : (
        // Sem adaptador da Evolution não há envio por aqui.
        <p className="flex items-center justify-center gap-2 border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
          <Eye aria-hidden className="h-3.5 w-3.5 shrink-0" />
          Somente leitura. Responda pelo WhatsApp da equipe.
        </p>
      )}

      {ficha && (
        <Sheet open={fichaAberta} onOpenChange={setFichaAberta}>
          <SheetContent side="right" className="w-[min(92vw,380px)] overflow-y-auto p-0">
            <SheetHeader className="border-b border-border p-4">
              <SheetTitle>Ficha do lead</SheetTitle>
            </SheetHeader>
            {ficha}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function LinhaDoTempoChips({ chips }: { chips: ChipLinha[] }) {
  if (chips.length === 0) return null;
  return (
    <ol aria-label="Linha do tempo" className="mb-2 flex flex-col items-center gap-1.5">
      {chips.map((c) => {
        const Icone = ICONE_CHIP[c.tipo];
        return (
          <li
            key={c.chave}
            className="flex max-w-full items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs"
            suppressHydrationWarning
          >
            <Icone aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate font-medium">{c.rotulo}</span>
            <span className="shrink-0 text-muted-foreground">· {dataDoChip(c.quando)}</span>
          </li>
        );
      })}
    </ol>
  );
}
