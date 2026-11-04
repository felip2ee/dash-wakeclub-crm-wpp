import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleX, Clock, Layers, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MonitorDaFila } from "@/features/admin/MonitorDaFila";
import { cn } from "@/lib/utils";
import { getMonitorFila, reprocessarEvento } from "@/server/admin-motor";
import { Carregando, ErroAoCarregar, Secao } from "./Secao";

// Mesma chave do MonitorDaFila: os dois leem um só cache.
export const CHAVE_FILA = ["admin", "monitor-fila"];

export function useMonitorFila() {
  return useQuery({
    queryKey: CHAVE_FILA,
    queryFn: () => getMonitorFila(),
    refetchInterval: 30_000,
  });
}

// Contadores da referência 02 + "Reprocessar fila" (devolve as falhas listadas, até 50);
// o detalhe por evento é o MonitorDaFila da fase 1. `id="fila"` é a âncora da Visão geral.
export function FilaEventos() {
  const queryClient = useQueryClient();
  const fila = useMonitorFila();
  const falhas = fila.data?.falhas ?? [];
  const falhos = fila.data?.falhos ?? 0;

  const reprocessarTudo = useMutation({
    // Em paralelo, sem parar no primeiro erro: um evento que já saiu de "falhou" não
    // impede os outros. Os que não voltaram são contados e avisados.
    mutationFn: async () => {
      const resultados = await Promise.allSettled(
        falhas.map((f) => reprocessarEvento({ data: { id: f.id } })),
      );
      const devolvidos = resultados.filter((r) => r.status === "fulfilled").length;
      return { devolvidos, recusados: resultados.length - devolvidos };
    },
    onSuccess: ({ devolvidos, recusados }) =>
      recusados === 0
        ? toast.success(`${devolvidos} evento(s) voltaram para a fila.`)
        : toast.warning(`${devolvidos} voltaram para a fila; ${recusados} não puderam voltar.`),
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao reprocessar."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE_FILA }),
  });

  return (
    <Secao
      id="fila"
      icone={Layers}
      titulo="Fila de eventos"
      subtitulo="Eventos de integração aguardando processamento."
    >
      {fila.isError ? (
        <ErroAoCarregar texto="Não deu para ler a fila." tentar={() => void fila.refetch()} />
      ) : !fila.data ? (
        <Carregando className="h-20" />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <dl className="grid flex-1 grid-cols-3 divide-x divide-border text-center">
              <Contador icone={Clock} rotulo="Pendentes" valor={fila.data.pendentes} />
              <Contador
                icone={TriangleAlert}
                rotulo="Atrasados"
                valor={fila.data.atrasados}
                cor="text-warning"
              />
              <Contador icone={CircleX} rotulo="Falhos" valor={falhos} cor="text-destructive" />
            </dl>
            <Button
              className="min-h-11 bg-gradiente-primario text-white"
              disabled={falhas.length === 0 || reprocessarTudo.isPending}
              onClick={() => reprocessarTudo.mutate()}
            >
              <RefreshCw aria-hidden className="h-4 w-4" />
              {falhos > falhas.length
                ? `Reprocessar as ${falhas.length} mais recentes`
                : "Reprocessar fila"}
            </Button>
          </div>
          {falhas.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                Ver falhas
              </summary>
              <MonitorDaFila />
            </details>
          )}
        </div>
      )}
    </Secao>
  );
}

function Contador({
  icone: Icone,
  rotulo,
  valor,
  cor,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: number;
  cor?: string;
}) {
  return (
    <div className="px-2">
      <Icone aria-hidden className={cn("mx-auto h-5 w-5", valor > 0 && cor)} />
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn("font-display text-2xl font-bold tabular-nums", valor > 0 && cor)}>
        {valor}
      </dd>
    </div>
  );
}
