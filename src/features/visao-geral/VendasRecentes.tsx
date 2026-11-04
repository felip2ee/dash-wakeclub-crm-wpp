import { Link } from "@tanstack/react-router";
import { ArrowRight, ShoppingCart } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { StatusVenda } from "@/features/dinheiro/ListaVendas";
import { clienteDa, ROTULO_CATEGORIA } from "@/features/dinheiro/venda";
import { dataHoraCompleta, moeda } from "@/lib/formato";
import type { VendaLinha } from "@/server/vendas";

const COLUNAS = ["Data", "Cliente", "Vendedor", "Categoria", "Valor", "Status"];

// As últimas vendas pagas do período (referência 03); a lista completa fica em /vendas.
export function VendasRecentes({ vendas }: { vendas: VendaLinha[] | undefined }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-start gap-3">
        <ShoppingCart aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">Vendas recentes</h2>
          <p className="text-sm text-muted-foreground">Últimas vendas registradas no CRM</p>
        </div>
        <Link
          to="/vendas"
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver todas as vendas <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </header>
      <div className="-mx-4 mt-3 overflow-x-auto px-4">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              {COLUNAS.map((c) => (
                <th key={c} scope="col" className="py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!vendas &&
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td colSpan={COLUNAS.length} className="py-1.5">
                    <Skeleton className="h-8" />
                  </td>
                </tr>
              ))}
            {vendas?.length === 0 && (
              <tr>
                <td colSpan={COLUNAS.length} className="py-8 text-center text-muted-foreground">
                  Nenhuma venda no período
                </td>
              </tr>
            )}
            {vendas?.map((v) => (
              <tr key={v.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3 tabular-nums">{dataHoraCompleta(v.compradaEm)}</td>
                <td className="py-2 pr-3">{clienteDa(v)}</td>
                <td className="py-2 pr-3">{v.vendedorNome ?? "—"}</td>
                <td className="py-2 pr-3">{v.categoria ? ROTULO_CATEGORIA[v.categoria] : "—"}</td>
                <td className="py-2 pr-3 tabular-nums">{moeda(v.valor)}</td>
                <td className="py-2">
                  <StatusVenda status={v.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
