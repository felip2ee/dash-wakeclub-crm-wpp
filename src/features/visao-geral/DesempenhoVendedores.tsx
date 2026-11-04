import { BarChart3, Trophy } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Skeleton } from "@/components/ui/skeleton";
import { percentuaisPorMaiorResto, textoPercentual } from "@/features/dinheiro/percentual";
import { moeda } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { ResumoDinheiro } from "@/server/dinheiro";

// Ouro, prata e bronze das medalhas da referência 03.
const MEDALHA = ["bg-yellow-500 text-black", "bg-zinc-400 text-black", "bg-orange-600 text-white"];

// Ranking por valor vendido no período (referência 03); % sobre o total da equipe.
export function DesempenhoVendedores({
  ranking,
}: {
  ranking: ResumoDinheiro["rankingPeriodo"] | undefined;
}) {
  const linhas = ranking ?? [];
  const percentuais = percentuaisPorMaiorResto(linhas.map((r) => r.valor));
  const vendas = linhas.reduce((t, r) => t + r.vendas, 0);
  const valor = Math.round(linhas.reduce((t, r) => t + r.valor, 0) * 100) / 100;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <Trophy aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <h2 className="font-display text-lg font-semibold">Desempenho de vendedores</h2>
          <p className="text-sm text-muted-foreground">Ranking por valor vendido no período</p>
        </div>
      </header>
      <div className="-mx-4 mt-3 overflow-x-auto px-4">
        <table className="w-full min-w-[26rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 font-medium">
                #
              </th>
              <th scope="col" className="py-2 font-medium">
                Vendedor
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Vendas
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Valor vendido
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                % do total
              </th>
            </tr>
          </thead>
          <tbody>
            {!ranking &&
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td colSpan={5} className="py-1.5">
                    <Skeleton className="h-8" />
                  </td>
                </tr>
              ))}
            {ranking && linhas.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhuma venda no período
                </td>
              </tr>
            )}
            {linhas.map((r, i) => (
              <tr key={r.vendedorId} className="border-b border-border">
                <td className="py-2">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      MEDALHA[i],
                    )}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <AvatarIniciais nome={r.nome} tamanho="sm" /> {r.nome}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{r.vendas}</td>
                <td className="py-2 text-right tabular-nums">{moeda(r.valor)}</td>
                <td className="py-2 text-right tabular-nums">{textoPercentual(percentuais[i])}</td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr>
                <th scope="row" colSpan={2} className="py-2 text-left font-semibold">
                  <span className="flex items-center gap-2">
                    <BarChart3 aria-hidden className="h-4 w-4" /> Total da equipe
                  </span>
                </th>
                <td className="py-2 text-right font-semibold tabular-nums">{vendas}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{moeda(valor)}</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {textoPercentual(100)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
