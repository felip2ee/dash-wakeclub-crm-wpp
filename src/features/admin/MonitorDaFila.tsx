import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dataHora } from "@/lib/formato";
import { getMonitorFila, reprocessarEvento } from "@/server/admin-motor";

const CHAVE = ["admin", "monitor-fila"];

export function MonitorDaFila() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: CHAVE,
    queryFn: () => getMonitorFila(),
    refetchInterval: 30_000,
  });
  const reprocessar = useMutation({
    mutationFn: (id: number) => reprocessarEvento({ data: { id } }),
    onSuccess: () => toast.success("Evento voltou para a fila."),
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao reprocessar."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  });

  if (!data) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 p-4">
        <CardTitle className="text-base">Fila de eventos</CardTitle>
        <Badge variant="secondary">{data.pendentes} pendentes</Badge>
        <Badge variant={data.atrasados > 0 ? "destructive" : "secondary"}>
          {data.atrasados} atrasados
        </Badge>
        <Badge variant={data.falhas.length > 0 ? "destructive" : "secondary"}>
          {data.falhas.length} com falha
        </Badge>
      </CardHeader>
      {data.falhas.length > 0 && (
        <CardContent className="space-y-2 px-4 pb-4">
          {data.falhas.map((f) => (
            <div
              key={f.id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 text-sm">
                <div className="font-medium">
                  #{f.id} · {f.origem} · {f.tentativas} tentativas
                </div>
                <div className="text-xs text-muted-foreground">{dataHora(f.recebidoEm)}</div>
                <div className="mt-1 break-words text-xs text-destructive">
                  {f.erro ?? "sem detalhe"}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={reprocessar.isPending}
                onClick={() => reprocessar.mutate(f.id)}
              >
                Reprocessar
              </Button>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
