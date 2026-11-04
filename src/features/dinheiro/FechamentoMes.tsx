import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { useState } from "react";
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
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Carregando, ErroAoCarregar } from "@/features/configuracoes/Secao";
import { dataHora, moeda, plural } from "@/lib/formato";
import { getFechamento, type LinhaFechamento, marcarPago } from "@/server/fechamento";
import { diaSP, mesAnterior, rotuloMes } from "./periodo";

function SeloPago({ pagoEm }: { pagoEm: string }) {
  return (
    <Badge className="gap-1 border-transparent bg-success text-success-foreground">
      <BadgeCheck aria-hidden className="h-3.5 w-3.5" /> Pago {dataHora(pagoEm)}
    </Badge>
  );
}

// Fechamento da comissão (pago no dia 10): por vendedor, o mês escolhido com vendas,
// comissão, ajustes e o que pagar. "Marcar pago" congela o mês do vendedor.
export function FechamentoMes() {
  const mesAtual = diaSP().slice(0, 7);
  const [mes, setMes] = useState(() => mesAnterior(mesAtual));
  // Mesmo formato que o servidor aceita; o campo vazio (ou limpo) não consulta.
  const valido = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  const encerrado = mes < mesAtual;
  const queryClient = useQueryClient();
  const fechamento = useQuery({
    queryKey: ["vendas", "fechamento", mes],
    queryFn: () => getFechamento({ data: { mes } }),
    enabled: valido,
  });
  const pagar = useMutation({
    mutationFn: (vendedorId: string) => marcarPago({ data: { vendedorId, mes } }),
    onSuccess: () => toast.success("Mês marcado como pago."),
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao marcar pago."),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendas"] }),
        queryClient.invalidateQueries({ queryKey: ["visao-geral"] }),
      ]),
  });
  const linhas = fechamento.data ?? [];
  const tudoPago = linhas.length > 0 && linhas.every((l) => l.pagoEm !== null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          Mês
          <Input
            type="month"
            value={mes}
            max={mesAtual}
            onChange={(e) => setMes(e.target.value)}
            className="min-h-11 w-auto"
          />
        </label>
        {tudoPago && (
          <Badge className="gap-1 border-transparent bg-success text-success-foreground">
            <BadgeCheck aria-hidden className="h-3.5 w-3.5" /> Mês pago
          </Badge>
        )}
        {valido && !encerrado && (
          <p className="text-sm text-muted-foreground">
            Mês em aberto: só dá para marcar pago depois que ele acabar.
          </p>
        )}
      </div>

      {!valido ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Escolha um mês.
        </p>
      ) : fechamento.isPending ? (
        <Carregando />
      ) : fechamento.isError ? (
        <ErroAoCarregar
          texto="Não deu para carregar o fechamento."
          tentar={() => void fechamento.refetch()}
        />
      ) : linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum vendedor com comissão neste mês.
        </p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Vendedor
                </th>
                {["Vendas", "Comissão", "Ajustes", "A pagar"].map((c) => (
                  <th key={c} scope="col" className="py-2 pr-3 text-right font-medium">
                    {c}
                  </th>
                ))}
                <th scope="col" className="py-2 text-right font-medium">
                  Pagamento
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.vendedorId} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <AvatarIniciais nome={l.nome} tamanho="sm" /> {l.nome}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {moeda(l.totalVendas)}
                    <span className="block text-xs text-muted-foreground">
                      {plural(l.quantidade, "venda", "vendas")}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(l.totalComissao)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(l.ajustes)}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                    {moeda(Math.max(0, l.aPagar))}
                    {l.aPagar < 0 && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        saldo {moeda(l.aPagar)} vai para o próximo mês
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {l.pagoEm ? (
                      <SeloPago pagoEm={l.pagoEm} />
                    ) : (
                      <MarcarPago
                        linha={l}
                        mes={mes}
                        disabled={!encerrado || pagar.isPending}
                        confirmar={() => pagar.mutate(l.vendedorId)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MarcarPago({
  linha,
  mes,
  disabled,
  confirmar,
}: {
  linha: LinhaFechamento;
  mes: string;
  disabled: boolean;
  confirmar: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" className="min-h-11" disabled={disabled}>
          Marcar pago
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Marcar {moeda(Math.max(0, linha.aPagar))} como pago para {linha.nome}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            O mês {rotuloMes(mes)} fica congelado para {linha.nome}. Estornos e vendas atrasadas
            desse mês entram como ajuste no próximo fechamento.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmar}>Marcar pago</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
