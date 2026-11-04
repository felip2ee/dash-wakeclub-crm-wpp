import { CalendarCheck, Wallet, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CardDegrade } from "@/components/ui/card-degrade";
import { Skeleton } from "@/components/ui/skeleton";
import { moeda } from "@/lib/formato";
import type { PainelVendedor as Painel } from "@/server/dinheiro";
import { rotuloMes } from "./periodo";

function Mini({
  titulo,
  valor,
  legenda,
  icone: Icone,
}: {
  titulo: string;
  valor: string;
  legenda: string;
  icone: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icone aria-hidden className="h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">{titulo}</p>
      <p className="font-display text-xl font-bold tabular-nums">{valor}</p>
      <p className="text-xs text-muted-foreground">{legenda}</p>
    </div>
  );
}

// Os três números de comissão do "Meu painel" (referência 05). Só o dinheiro do próprio
// vendedor: o servidor (`getPainelVendedor`) não aceita outro.
export function PainelVendedor({ painel }: { painel: Painel | undefined }) {
  if (!painel)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando comissões">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    );
  return (
    <div className="space-y-3">
      <CardDegrade
        titulo="Pode entrar"
        valor={moeda(painel.podeEntrar)}
        legenda="Comissão estimada dos seus leads ativos"
        icone={TrendingUp}
        info="Valor esperado dos seus leads ativos × sua comissão. É estimativa: só vira comissão quando a venda entra."
      />
      <div className="grid grid-cols-2 gap-3">
        <Mini
          titulo="Garantida no mês"
          valor={moeda(painel.garantidaNoMes)}
          legenda="Vendas comissionáveis deste mês"
          icone={CalendarCheck}
        />
        <Mini
          titulo="A pagar dia 10"
          valor={moeda(painel.aPagarDia10.valor)}
          legenda={`Comissão de ${rotuloMes(painel.aPagarDia10.mes)}`}
          icone={Wallet}
        />
      </div>
    </div>
  );
}
