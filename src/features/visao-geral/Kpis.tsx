import { Coins, Flame, ShoppingCart, Target } from "lucide-react";

import { CardDegrade } from "@/components/ui/card-degrade";
import { Skeleton } from "@/components/ui/skeleton";
import { rotuloMes } from "@/features/dinheiro/periodo";
import { moeda, plural } from "@/lib/formato";
import type { ResumoDinheiro } from "@/server/dinheiro";

type Totais = {
  leadsAtivos: number;
  valorCheio: number;
  valorEsperado: number;
  probabilidade: number;
};

// Os quatro KPIs da referência 03: dois do pipeline (estado atual) e dois de vendas.
export function Kpis({
  totais,
  vendas,
}: {
  totais: Totais | undefined;
  vendas: ResumoDinheiro | undefined;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {totais ? (
        <>
          <CardDegrade
            titulo="Pipeline cheio"
            valor={moeda(totais.valorCheio)}
            legenda={plural(totais.leadsAtivos, "lead ativo", "leads ativos")}
            icone={Flame}
            info="Soma de horas estimadas × preço da hora dos leads que ainda podem fechar."
          />
          <CardDegrade
            titulo="Estimativa realista"
            valor={moeda(totais.valorEsperado)}
            legenda={`${totais.probabilidade}% de probabilidade`}
            icone={Target}
            info="Valor cheio × chance de fechar por etapa e temperatura."
          />
        </>
      ) : (
        <>
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </>
      )}
      {vendas ? (
        <>
          <CardDegrade
            titulo="Vendido no período"
            valor={moeda(vendas.vendidoPeriodo.valor)}
            legenda={`${plural(vendas.vendidoPeriodo.quantidade, "venda", "vendas")} · App ${moeda(vendas.vendidoPeriodo.valorApp)} · Direta ${moeda(vendas.vendidoPeriodo.valorDireta)}`}
            icone={ShoppingCart}
            info="Vendas pagas no período escolhido; estornadas não contam."
          />
          <CardDegrade
            titulo="Comissão a pagar dia 10"
            valor={moeda(vendas.comissaoAPagarDia10.valor)}
            legenda={`Referente a ${rotuloMes(vendas.comissaoAPagarDia10.mes)}`}
            icone={Coins}
            info="Comissão do mês anterior ainda não marcada como paga em Vendas e comissões."
          />
        </>
      ) : (
        <>
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </>
      )}
    </div>
  );
}
