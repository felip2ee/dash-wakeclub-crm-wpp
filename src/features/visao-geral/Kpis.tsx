import { Coins, Flame, ShoppingCart, Target } from "lucide-react";

import { CardDegrade } from "@/components/ui/card-degrade";
import { Skeleton } from "@/components/ui/skeleton";
import { moeda, plural } from "@/lib/formato";

type Totais = {
  leadsAtivos: number;
  valorCheio: number;
  valorEsperado: number;
  probabilidade: number;
};

// Os quatro KPIs da referência 03. Os de pipeline já têm dado; os de venda esperam a fase 4.
export function Kpis({ totais }: { totais: Totais | undefined }) {
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
      <CardDegrade
        titulo="Vendido no período"
        valor="Em breve"
        legenda="Ainda sem vendas pelo webhook"
        icone={ShoppingCart}
      />
      <CardDegrade
        titulo="Comissão a pagar dia 10"
        valor="Em breve"
        legenda="Calculada sobre as vendas recebidas"
        icone={Coins}
      />
    </div>
  );
}
