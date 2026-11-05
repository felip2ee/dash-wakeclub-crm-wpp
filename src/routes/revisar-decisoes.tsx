import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CardRevisao } from "@/features/revisao/CardRevisao";
import { exigirAdmin } from "@/server/auth";
import { listarDecisoesParaRevisar, revisarDecisao } from "@/server/revisao";

export const Route = createFileRoute("/revisar-decisoes")({
  validateSearch: z.object({ dias: z.enum(["7", "30"]).optional() }),
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Revisão das decisões — Wake Club" }] }),
  component: RevisarDecisoesPage,
});

// Admin marca Concordo / Discordo nas decisões das atendentes; só isso alimenta os prompts.
function RevisarDecisoesPage() {
  const { dias = "7" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const cliente = useQueryClient();
  const lista = useQuery({
    queryKey: ["revisao", dias],
    queryFn: () => listarDecisoesParaRevisar({ data: { dias: Number(dias) } }),
  });
  const revisar = useMutation({
    mutationFn: (v: { avaliacaoId: string; concorda: boolean; observacao: string }) =>
      revisarDecisao({ data: v }),
    onSuccess: () => {
      toast.success("Revisão registrada.");
      return cliente.invalidateQueries({ queryKey: ["revisao"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Revisão das decisões</h1>
          <p className="text-muted-foreground">
            Suas revisões ensinam a IA; as decisões das atendentes não.
          </p>
        </div>
        <Select
          value={dias}
          onValueChange={(v) => navigate({ search: { dias: v === "30" ? "30" : "7" } })}
        >
          <SelectTrigger
            aria-label="Período"
            className="min-h-11 w-auto gap-2 rounded-xl bg-card px-4"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {lista.isPending ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      ) : lista.isError ? (
        <p role="alert" className="text-destructive">
          Não foi possível carregar as decisões. {lista.error.message}
        </p>
      ) : lista.data.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          Nenhuma decisão para revisar neste período
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {lista.data.map((d) => (
            <CardRevisao
              key={d.avaliacaoId}
              decisao={d}
              ocupado={revisar.isPending}
              onRevisar={(concorda, observacao) =>
                revisar.mutate({ avaliacaoId: d.avaliacaoId, concorda, observacao })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
