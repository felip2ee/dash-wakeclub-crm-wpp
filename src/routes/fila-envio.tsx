import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { ListaFilaEnvio } from "@/features/fila-envio/ListaFilaEnvio";
import { plural } from "@/lib/formato";
import { exigirAdmin } from "@/server/auth";
import { getFilaEnvio, removerDaFilaEnvio } from "@/server/fila-envio";

export const Route = createFileRoute("/fila-envio")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Fila de envio — Wake Club" }] }),
  component: FilaEnvioPage,
});

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="font-display text-2xl font-bold tabular-nums">{valor}</p>
    </div>
  );
}

function previsao(dias: number): string {
  if (dias === 0) return "Fila vazia";
  if (dias === 1) return "Hoje";
  return dias === 2 ? "Amanhã" : `${dias} dias`;
}

// Aprovados que ainda não saíram. O envio é da tarefa agendada, limitada pela cota do dia.
function FilaEnvioPage() {
  const cliente = useQueryClient();
  const fila = useQuery({
    queryKey: ["fila-envio"],
    queryFn: () => getFilaEnvio(),
    refetchInterval: 30_000,
  });
  const remover = useMutation({
    mutationFn: (followupId: string) => removerDaFilaEnvio({ data: { followupId } }),
    onSuccess: () => toast.success("Removido da fila."),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível remover."),
    // Também no erro: "já saiu da fila" tira o item da lista.
    onSettled: () => cliente.invalidateQueries({ queryKey: ["fila-envio"] }),
  });

  return (
    <div className="space-y-5 px-4 py-6 md:px-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Fila de envio</h1>
        <p className="text-muted-foreground">
          Follow-ups aprovados esperando a vez. Os lembretes de aula saem primeiro.
        </p>
      </header>

      {fila.isPending ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : fila.isError ? (
        <p role="alert" className="text-destructive">
          Não foi possível carregar a fila. {fila.error.message}
        </p>
      ) : (
        <>
          <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-3">
            <Kpi rotulo="Na fila" valor={String(fila.data.itens.length)} />
            <Kpi
              rotulo={`Saem hoje (${fila.data.enviadosHoje} de ${fila.data.cotaDia} já enviados)`}
              valor={String(fila.data.saemHoje)}
            />
            <Kpi rotulo="Previsão de esvaziar" valor={previsao(fila.data.previsaoDias)} />
          </section>
          {fila.data.itens.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              Nenhum follow-up aprovado esperando envio
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {plural(fila.data.itens.length, "follow-up", "follow-ups")} na ordem de envio.
              </p>
              <ListaFilaEnvio
                itens={fila.data.itens}
                ocupado={remover.isPending}
                onRemover={(id) => remover.mutate(id)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
