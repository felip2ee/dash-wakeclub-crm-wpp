import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Carregando, ErroAoCarregar } from "@/features/configuracoes/Secao";
import { dataHoraCompleta, moeda } from "@/lib/formato";
import { estornarVenda, listarVendas, type VendaLinha } from "@/server/vendas";
import { clienteDa, ROTULO_CATEGORIA } from "./venda";

export function StatusVenda({ status }: { status: VendaLinha["status"] }) {
  return status === "paga" ? (
    <Badge className="border-transparent bg-success text-success-foreground">Vendido</Badge>
  ) : (
    <Badge variant="destructive">Estornada</Badge>
  );
}

// Todas as vendas do período (pagas e estornadas), com estorno manual para quando o
// webhook não trouxer o cancelamento.
export function ListaVendas({
  filtro,
}: {
  filtro: { de: string; ate: string; vendedorId?: string };
}) {
  const queryClient = useQueryClient();
  const vendas = useQuery({
    queryKey: ["vendas", "lista", filtro],
    queryFn: () => listarVendas({ data: filtro }),
  });
  const estornar = useMutation({
    mutationFn: (vendaId: string) => estornarVenda({ data: { vendaId } }),
    onSuccess: () => toast.success("Venda estornada."),
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao estornar."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["vendas"] }),
  });

  if (vendas.isPending) return <Carregando />;
  if (vendas.isError)
    return (
      <ErroAoCarregar
        texto="Não deu para carregar as vendas."
        tentar={() => void vendas.refetch()}
      />
    );
  if (vendas.data.length === 0)
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhuma venda no período.
      </p>
    );

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-border">
            {["Data", "Cliente", "Vendedor", "Categoria", "Valor", "Status"].map((c) => (
              <th key={c} scope="col" className="py-2 pr-3 font-medium">
                {c}
              </th>
            ))}
            <th scope="col" className="py-2">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {vendas.data.map((v) => (
            <tr key={v.id} className="border-b border-border last:border-0">
              <td className="py-2 pr-3 tabular-nums">{dataHoraCompleta(v.compradaEm)}</td>
              <td className="py-2 pr-3">{clienteDa(v)}</td>
              <td className="py-2 pr-3">{v.vendedorNome ?? "—"}</td>
              <td className="py-2 pr-3">{v.categoria ? ROTULO_CATEGORIA[v.categoria] : "—"}</td>
              <td className="py-2 pr-3 tabular-nums">{moeda(v.valor)}</td>
              <td className="py-2 pr-3">
                <StatusVenda status={v.status} />
              </td>
              <td className="py-2 text-right">
                {v.status === "paga" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        disabled={estornar.isPending}
                      >
                        Estornar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Estornar venda de {moeda(v.valor)}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {clienteDa(v)} · {dataHoraCompleta(v.compradaEm)}. A venda sai do vendido
                          e da comissão; se o mês já foi pago, a comissão vira desconto no próximo
                          fechamento.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => estornar.mutate(v.id)}>
                          Estornar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
