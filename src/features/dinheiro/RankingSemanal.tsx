import { Trophy } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { moeda } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { PosicaoRanking } from "@/server/dinheiro";

// "Ranking da semana" (referência 05): segunda a domingo, por valor comissionável. É a
// única tela em que o vendedor vê números de outro (design §9.3).
export function RankingSemanal({ ranking }: { ranking: PosicaoRanking[] }) {
  const eu = ranking.find((r) => r.eu);
  // O servidor traz todo o time, com zero; sem nenhuma venda não há ordem a mostrar.
  const semVendas = ranking.every((r) => r.valor === 0);
  return (
    <section aria-labelledby="ranking" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ranking" className="text-lg font-semibold">
          Ranking da semana
        </h2>
        {eu && !semVendas && (
          <p className="text-sm text-muted-foreground">Você está em {eu.posicao}º</p>
        )}
      </div>
      {semVendas ? (
        <p className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <Trophy aria-hidden className="h-5 w-5 shrink-0" /> Nenhuma venda nesta semana ainda.
        </p>
      ) : (
        <ol className="space-y-2">
          {ranking.map((r) => (
            <li
              key={r.vendedorId}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2",
                r.eu && "border-primary",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  r.posicao <= 3 ? "bg-gradiente-primario text-white" : "bg-muted",
                )}
              >
                {r.posicao}
              </span>
              <AvatarIniciais nome={r.nome} tamanho="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {r.nome}
                {r.eu && <span className="text-muted-foreground"> (você)</span>}
              </span>
              <span className="font-semibold tabular-nums">{moeda(r.valor)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
