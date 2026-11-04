import {
  BarChart3,
  CalendarDays,
  Headphones,
  Link2,
  type LucideIcon,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { percentuaisPorMaiorResto, textoPercentual } from "@/features/dinheiro/percentual";
import { moeda, plural } from "@/lib/formato";
import type { ResumoDinheiro } from "@/server/dinheiro";

const CATEGORIAS: Record<string, { nome: string; icone: LucideIcon }> = {
  "follow-up": { nome: "Follow-up", icone: CalendarDays },
  atendimento: { nome: "Atendimento", icone: Headphones },
  recompra: { nome: "Recompra", icone: RefreshCw },
  espontanea: { nome: "Espontânea", icone: Sparkles },
};
// Venda sem dono ainda não tem categoria; o servidor só a manda quando existe.
const SEM_DONO = { nome: "Sem dono", icone: Link2 };

// Valor, quantidade e a pílula de % de cada categoria no período (referência 03).
export function VendasPorCategoria({
  categorias,
}: {
  categorias: ResumoDinheiro["porCategoria"] | undefined;
}) {
  const percentuais = percentuaisPorMaiorResto(categorias?.map((c) => c.valor) ?? []);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <BarChart3 aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <h2 className="font-display text-lg font-semibold">Vendas por categoria</h2>
          <p className="text-sm text-muted-foreground">Valor e quantidade de vendas no período</p>
        </div>
      </header>
      {categorias ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:divide-x md:divide-border">
          {categorias.map((c, i) => {
            const { nome, icone: Icone } = c.categoria ? CATEGORIAS[c.categoria] : SEM_DONO;
            return (
              <li key={nome} className="md:px-3 md:first:pl-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Icone aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{nome}</span>
                  <span className="rounded-full bg-gradiente-primario px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                    {textoPercentual(percentuais[i])}
                  </span>
                </p>
                <p className="mt-1 font-display text-xl font-bold tabular-nums">{moeda(c.valor)}</p>
                <p className="text-xs text-muted-foreground">
                  {plural(c.quantidade, "venda", "vendas")}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <Skeleton className="mt-4 h-16 rounded-lg" />
      )}
    </section>
  );
}
