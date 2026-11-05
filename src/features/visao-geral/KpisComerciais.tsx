import { Coins, Percent, Target, UserPlus } from "lucide-react";

import { CardDegrade } from "@/components/ui/card-degrade";
import { Skeleton } from "@/components/ui/skeleton";
import { moeda, plural } from "@/lib/formato";
import type { ResumoComercial } from "@/server/comercial";

import { textoVariacao } from "./variacao";

// Os quatro KPIs comerciais (spec visão comercial §4.3): vendas × meta, faturamento,
// leads novos e conversão da coorte; abaixo, o que veio de clientes existentes.
export function KpisComerciais({ comercial }: { comercial: ResumoComercial | undefined }) {
  if (!comercial) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }
  const { meta, vendas, leadsNovos, coorte, clientesExistentes } = comercial;
  const projecao = meta.projecaoMes === null ? "" : ` · projeção ${meta.projecaoMes} no mês`;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CardDegrade
          titulo="Vendas × meta"
          valor={`${vendas.quantidade.atual} de ${meta.periodo}`}
          legenda={`${meta.atingidoPct}% da meta${projecao}`}
          icone={Target}
          info={`Meta de ${plural(meta.porDia, "venda", "vendas")} por dia × dias do período, contando hoje. A projeção do mês só aparece no mês corrente.`}
        />
        <CardDegrade
          titulo="Faturamento"
          valor={moeda(vendas.faturamento.atual)}
          legenda={textoVariacao(vendas.faturamento.atual, vendas.faturamento.anterior)}
          icone={Coins}
          info="Vendas pagas no período escolhido; estornadas não contam."
        />
        <CardDegrade
          titulo="Leads novos"
          valor={String(leadsNovos.atual)}
          legenda={textoVariacao(leadsNovos.atual, leadsNovos.anterior)}
          icone={UserPlus}
          info="Lead cuja primeira mensagem recebida caiu no período."
        />
        <CardDegrade
          titulo="Conversão da coorte"
          valor={`${coorte.conversaoPct}%`}
          legenda={`${coorte.compraram} de ${leadsNovos.atual} compraram até hoje`}
          icone={Percent}
          info="Lead que chegou no período e comprou em qualquer data; sem comparação porque a coorte anterior teve mais tempo"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Clientes existentes: {plural(clientesExistentes.quantidade, "venda", "vendas")} ·{" "}
        {moeda(clientesExistentes.faturamento)} (recompra ou novo pacote; fora da conversão)
      </p>
    </div>
  );
}
